import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Building2,
  Mail,
  CheckSquare,
  Settings,
  Home,
  TrendingUp,
  Bell,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/pipeline", icon: TrendingUp, label: "Pipeline" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/listings", icon: Building2, label: "Listings" },
  { to: "/emails", icon: Mail, label: "Email Hub" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
];

export default function Sidebar() {
  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="w-64 bg-surface border-r border-white/5 flex flex-col h-screen fixed left-0 top-0 z-50"
    >
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">RealFlow</h1>
            <p className="text-xs text-slate-400">CRM & Automation</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? "bg-primary/15 text-primary-light"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary-light" : "text-slate-500 group-hover:text-slate-300"}`} />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-light"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-orange-500 flex items-center justify-center text-sm font-bold text-white">
            LP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Louis Pine</p>
            <p className="text-xs text-slate-400">Premium Agent</p>
          </div>
          <button className="relative p-1.5 text-slate-400 hover:text-white transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-danger rounded-full border-2 border-surface" />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
