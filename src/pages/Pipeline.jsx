import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Phone, Mail, Calendar, Star, MoreHorizontal } from "lucide-react";
import { clients as initialClients, pipelineStages } from "../data/mockData";

export default function Pipeline() {
  const [clientList, setClientList] = useState(initialClients);

  const getClientsForStage = (stageId) =>
    clientList.filter((c) => c.stage === stageId);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    setClientList((prev) =>
      prev.map((c) =>
        c.id === parseInt(draggableId) ? { ...c, stage: destination.droppableId } : c
      )
    );
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Client Pipeline</h1>
          <p className="text-slate-400 mt-1">Drag clients between stages to update their status</p>
        </div>
        <div className="flex items-center gap-2">
          {pipelineStages.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span>{getClientsForStage(s.id).length}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-6 gap-3 min-h-[calc(100vh-180px)]">
          {pipelineStages.map((stage, si) => (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.05 }}
              className="flex flex-col"
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                  <h3 className="text-sm font-semibold text-white">{stage.label}</h3>
                </div>
                <span className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">
                  {getClientsForStage(stage.id).length}
                </span>
              </div>

              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 rounded-xl p-2 space-y-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5 border-2 border-dashed border-primary/30" : "bg-white/[0.02]"
                    }`}
                  >
                    {getClientsForStage(stage.id).map((client, i) => (
                      <Draggable key={client.id} draggableId={String(client.id)} index={i}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-surface rounded-xl p-4 border border-white/5 cursor-grab active:cursor-grabbing transition-all ${
                              snapshot.isDragging ? "shadow-xl shadow-primary/10 border-primary/30 rotate-2 scale-105" : "hover:border-white/10"
                            }`}
                          >
                            {/* Avatar & Name */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                                  style={{ background: `${stage.color}33` }}
                                >
                                  {client.avatar}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white truncate max-w-[100px]">{client.name}</p>
                                  <p className="text-xs text-slate-500">{client.type}</p>
                                </div>
                              </div>
                            </div>

                            {/* Score */}
                            <div className="mb-3">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-500">Lead Score</span>
                                <span className="text-white font-medium">{client.score}</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${client.score}%` }}
                                  transition={{ delay: 0.5, duration: 0.8 }}
                                  className="h-full rounded-full"
                                  style={{ background: stage.color }}
                                />
                              </div>
                            </div>

                            {/* Budget */}
                            <p className="text-xs text-slate-400 mb-3">{client.budget}</p>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                                <Phone className="w-3 h-3" />
                              </button>
                              <button className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                                <Mail className="w-3 h-3" />
                              </button>
                              <button className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                                <Calendar className="w-3 h-3" />
                              </button>
                              <span className="text-xs text-slate-600 ml-auto">{client.lastContact}</span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </motion.div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
