import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Circle, Phone, Mail, Calendar, ClipboardList,
  Clock, AlertCircle, Plus, Star,
} from "lucide-react";
import { tasks as initialTasks } from "../data/mockData";

const typeIcons = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  task: ClipboardList,
};

const typeColors = {
  call: "text-success bg-success/10",
  email: "text-info bg-info/10",
  meeting: "text-accent bg-accent/10",
  task: "text-primary-light bg-primary/10",
};

export default function Tasks() {
  const [taskList, setTaskList] = useState(initialTasks);
  const [filter, setFilter] = useState("all");

  const toggleTask = (id) => {
    setTaskList((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const filtered = taskList.filter((t) => {
    if (filter === "pending") return !t.done;
    if (filter === "completed") return t.done;
    return true;
  });

  const completedCount = taskList.filter((t) => t.done).length;
  const progress = (completedCount / taskList.length) * 100;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Tasks & Reminders</h1>
          <p className="text-slate-400 mt-1">Stay on top of your daily activities</p>
        </div>
        <button className="px-4 py-2.5 bg-primary rounded-xl text-white text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface rounded-2xl p-6 border border-white/5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold">Today's Progress</h3>
          <span className="text-sm text-slate-400">{completedCount} of {taskList.length} completed</span>
        </div>
        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full"
          />
        </div>
        <div className="flex items-center gap-6 mt-4 text-sm">
          {[
            { label: "High Priority", count: taskList.filter((t) => t.priority === "high" && !t.done).length, color: "text-danger" },
            { label: "Medium Priority", count: taskList.filter((t) => t.priority === "medium" && !t.done).length, color: "text-warning" },
            { label: "Low Priority", count: taskList.filter((t) => t.priority === "low" && !t.done).length, color: "text-slate-400" },
          ].map((p) => (
            <div key={p.label} className="flex items-center gap-2">
              <AlertCircle className={`w-4 h-4 ${p.color}`} />
              <span className="text-slate-400">{p.label}:</span>
              <span className={`font-semibold ${p.color}`}>{p.count}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex bg-surface rounded-xl border border-white/5 p-1 w-fit">
        {["all", "pending", "completed"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all capitalize ${
              filter === f ? "bg-primary/15 text-primary-light" : "text-slate-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        <AnimatePresence>
          {filtered.map((task, i) => {
            const Icon = typeIcons[task.type] || ClipboardList;
            const colors = typeColors[task.type] || typeColors.task;
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.03 }}
                layout
                className={`bg-surface rounded-xl p-5 border transition-all cursor-pointer ${
                  task.done ? "border-white/5 opacity-60" : "border-white/5 hover:border-white/10"
                }`}
                onClick={() => toggleTask(task.id)}
              >
                <div className="flex items-center gap-4">
                  <motion.div
                    whileTap={{ scale: 0.8 }}
                    className="shrink-0"
                  >
                    {task.done ? (
                      <CheckCircle className="w-6 h-6 text-success" />
                    ) : (
                      <Circle className="w-6 h-6 text-slate-600 hover:text-primary-light transition-colors" />
                    )}
                  </motion.div>

                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${task.done ? "line-through text-slate-500" : "text-white"}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.time}</span>
                      <span className="capitalize">{task.type}</span>
                    </div>
                  </div>

                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    task.priority === "high" ? "bg-danger/10 text-danger" :
                    task.priority === "medium" ? "bg-warning/10 text-warning" :
                    "bg-slate-500/10 text-slate-400"
                  }`}>
                    {task.priority}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
