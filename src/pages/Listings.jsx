import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Bed, Bath, Maximize, Clock, TrendingUp,
  Heart, ExternalLink, Filter,
} from "lucide-react";
import { listings } from "../data/mockData";

const statusColors = {
  active: { bg: "bg-success/10", text: "text-success", label: "Active" },
  pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
  sold: { bg: "bg-primary/10", text: "text-primary-light", label: "Sold" },
};

export default function Listings() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hoveredId, setHoveredId] = useState(null);

  const filtered = listings.filter((l) => {
    const matchesSearch = l.address.toLowerCase().includes(search.toLowerCase()) ||
      l.city.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Listings</h1>
          <p className="text-slate-400 mt-1">{listings.length} properties in your portfolio</p>
        </div>
        <button className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-medium hover:bg-primary-dark transition-colors">
          + Add Listing
        </button>
      </motion.div>

      {/* Search & Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3"
      >
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by address or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <div className="flex bg-surface rounded-xl border border-white/5 p-1">
          {["all", "active", "pending", "sold"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                statusFilter === s ? "bg-primary/15 text-primary-light" : "text-slate-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-4 gap-3"
      >
        {[
          { label: "Total Value", value: `$${(listings.reduce((a, l) => a + l.price, 0) / 1000000).toFixed(1)}M` },
          { label: "Active", value: listings.filter((l) => l.status === "active").length },
          { label: "Pending", value: listings.filter((l) => l.status === "pending").length },
          { label: "Avg Days on Market", value: Math.round(listings.reduce((a, l) => a + l.daysOnMarket, 0) / listings.length) },
        ].map((stat, i) => (
          <div key={i} className="bg-surface rounded-xl px-4 py-3 border border-white/5">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className="text-xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </motion.div>

      {/* Property Cards */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((listing, i) => {
          const status = statusColors[listing.status];
          return (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              onMouseEnter={() => setHoveredId(listing.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="bg-surface rounded-2xl border border-white/5 overflow-hidden hover:border-primary/30 transition-all group"
            >
              {/* Image Placeholder */}
              <div className="relative h-48 bg-gradient-to-br from-surface-light to-surface-lighter flex items-center justify-center overflow-hidden">
                <span className="text-6xl">{listing.image}</span>
                <motion.div
                  animate={{ opacity: hoveredId === listing.id ? 1 : 0 }}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center gap-3"
                >
                  <button className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl text-white hover:bg-white/30 transition-colors">
                    <Heart className="w-5 h-5" />
                  </button>
                  <button className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl text-white hover:bg-white/30 transition-colors">
                    <ExternalLink className="w-5 h-5" />
                  </button>
                </motion.div>
                <div className="absolute top-3 left-3">
                  <span className={`${status.bg} ${status.text} text-xs font-semibold px-3 py-1 rounded-full`}>
                    {status.label}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span className="bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {listing.daysOnMarket}d
                  </span>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-white">${listing.price.toLocaleString()}</h3>
                  <span className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded-lg">{listing.type}</span>
                </div>
                <p className="text-sm text-slate-300 flex items-center gap-1 mb-3">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  {listing.address}, {listing.city}
                </p>

                <div className="flex items-center gap-4 mb-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1"><Bed className="w-4 h-4" />{listing.beds} bd</span>
                  <span className="flex items-center gap-1"><Bath className="w-4 h-4" />{listing.baths} ba</span>
                  <span className="flex items-center gap-1"><Maximize className="w-4 h-4" />{listing.sqft.toLocaleString()} sqft</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {listing.features.slice(0, 3).map((f) => (
                    <span key={f} className="text-xs bg-white/5 text-slate-400 px-2 py-1 rounded-lg">{f}</span>
                  ))}
                  {listing.features.length > 3 && (
                    <span className="text-xs bg-white/5 text-slate-500 px-2 py-1 rounded-lg">
                      +{listing.features.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
