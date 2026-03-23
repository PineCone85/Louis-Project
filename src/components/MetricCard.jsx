import { motion } from "framer-motion";

export default function MetricCard({ icon: Icon, label, value, change, changeType, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="bg-surface rounded-2xl p-6 border border-white/5 hover:border-primary/30 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-6 h-6 text-primary-light" />
        </div>
        {change && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
            changeType === "up" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
          }`}>
            {changeType === "up" ? "+" : ""}{change}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </motion.div>
  );
}
