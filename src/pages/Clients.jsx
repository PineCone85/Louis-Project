import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Phone, Mail, MapPin, Star, ChevronRight,
  Calendar, MessageSquare, Clock, Tag, X, Home,
} from "lucide-react";
import { clients, pipelineStages } from "../data/mockData";

const stageMap = Object.fromEntries(pipelineStages.map((s) => [s.id, s]));

export default function Clients() {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const filtered = clients.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || c.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Clients</h1>
          <p className="text-slate-400 mt-1">{clients.length} total clients in your database</p>
        </div>
        <button className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-medium hover:bg-primary-dark transition-colors">
          + Add Client
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
            placeholder="Search clients by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <div className="flex bg-surface rounded-xl border border-white/5 p-1">
          {["all", "buyer", "seller"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filterType === t ? "bg-primary/15 text-primary-light" : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "all" ? "All" : t === "buyer" ? "Buyers" : "Sellers"}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="flex gap-4">
        {/* Client List */}
        <div className="flex-1 space-y-2">
          {filtered.map((client, i) => {
            const stage = stageMap[client.stage];
            return (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedClient(client)}
                className={`bg-surface rounded-xl p-5 border cursor-pointer transition-all group ${
                  selectedClient?.id === client.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-white/5 hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: `linear-gradient(135deg, ${stage.color}66, ${stage.color}33)` }}
                  >
                    {client.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold">{client.name}</h3>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: `${stage.color}22`, color: stage.color }}
                      >
                        {stage.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        client.type === "buyer" ? "bg-info/10 text-info" : "bg-accent/10 text-accent"
                      }`}>
                        {client.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-400">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 mb-1">
                      <Star className="w-3.5 h-3.5 text-accent" />
                      <span className="text-white font-semibold text-sm">{client.score}</span>
                    </div>
                    <p className="text-xs text-slate-500">{client.lastContact}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Client Detail Panel */}
        <AnimatePresence>
          {selectedClient && (
            <motion.div
              initial={{ opacity: 0, x: 40, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 380 }}
              exit={{ opacity: 0, x: 40, width: 0 }}
              className="bg-surface rounded-2xl border border-white/5 overflow-hidden shrink-0"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Client Details</h3>
                  <button onClick={() => setSelectedClient(null)} className="p-1 text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-center mb-6">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white mx-auto mb-3"
                    style={{ background: `linear-gradient(135deg, ${stageMap[selectedClient.stage].color}, #6366f1)` }}
                  >
                    {selectedClient.avatar}
                  </div>
                  <h4 className="text-xl font-bold text-white">{selectedClient.name}</h4>
                  <p className="text-sm text-slate-400">{selectedClient.source} Lead</p>
                </div>

                <div className="space-y-4">
                  <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-300">{selectedClient.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-300">{selectedClient.phone}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Tag className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-300">{selectedClient.budget}</span>
                    </div>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4">
                    <h5 className="text-sm font-semibold text-white mb-3">Preferences</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-slate-500 text-xs">Beds</span>
                        <p className="text-white font-medium">{selectedClient.preferences.beds}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-slate-500 text-xs">Baths</span>
                        <p className="text-white font-medium">{selectedClient.preferences.baths}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-slate-500 text-xs">Sqft</span>
                        <p className="text-white font-medium">{selectedClient.preferences.sqft}</p>
                      </div>
                      <div className="bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-slate-500 text-xs">Location</span>
                        <p className="text-white font-medium">{selectedClient.preferences.location}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4">
                    <h5 className="text-sm font-semibold text-white mb-2">Notes</h5>
                    <p className="text-sm text-slate-400">{selectedClient.notes}</p>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-500">Next Follow-up</span>
                      <p className="text-white font-medium flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-primary-light" />
                        {selectedClient.nextFollowUp || "None scheduled"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Last Contact</span>
                      <p className="text-white font-medium flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-accent" />
                        {selectedClient.lastContact}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button className="flex-1 py-2.5 bg-primary rounded-xl text-white text-sm font-medium hover:bg-primary-dark transition-colors flex items-center justify-center gap-2">
                      <Mail className="w-4 h-4" /> Email
                    </button>
                    <button className="flex-1 py-2.5 bg-white/5 rounded-xl text-white text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                      <Phone className="w-4 h-4" /> Call
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
