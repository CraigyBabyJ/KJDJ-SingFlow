import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from 'axios';
import { toTitleCase } from '../lib/text';

const SortableQueueItem = ({ item, onAction, onPlayItem, dragDisabled }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        disabled: dragDisabled,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={`rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2 ${isDragging ? 'ring-2 ring-emerald-500/40' : ''}`}
        >
            <div className="flex items-center gap-3">
                <button
                    {...(dragDisabled ? {} : listeners)}
                    className={`text-zinc-500 ${dragDisabled ? 'cursor-not-allowed opacity-40' : 'hover:text-zinc-300'}`}
                    aria-label="Drag"
                >
                    ☰
                </button>
                <div className="flex-1">
                    <div className="text-base font-semibold text-zinc-100">{item.singer_name}</div>
                    <div
                        className="text-sm text-zinc-300 truncate max-w-[440px]"
                        title={item.file_path || undefined}
                    >
                        {toTitleCase(item.title)} — {toTitleCase(item.artist)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => onPlayItem?.(item.id)}
                        className="text-lg text-emerald-300 hover:text-emerald-200"
                        aria-label="Play"
                    >
                        ▶️
                    </button>
                    <button
                        onClick={() => onAction('delete', item.id)}
                        className="text-lg text-red-300 hover:text-red-200"
                        aria-label="Delete"
                    >
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    );
};

const QueuePanel = ({ queue, onUpdate, onReorder, onPlayItem, rotationEnabled }) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (!over) return;
        if (rotationEnabled) {
            return;
        }
        if (active.id !== over.id) {
            const oldIndex = queue.findIndex(i => i.id === active.id);
            const newIndex = queue.findIndex(i => i.id === over.id);
            const newOrder = arrayMove(queue, oldIndex, newIndex).map((item, index) => ({
                ...item,
                position: index + 1,
            }));
            onReorder?.(newOrder);

            const ids = newOrder.map(i => i.id);
            try {
                await axios.patch('/api/queue/reorder', { queueIds: ids });
                onUpdate();
            } catch (err) { console.error("Reorder failed", err); }
        }
    };

    const handleAction = async (action, id) => {
        try {
            if (action === 'delete') {
                await axios.delete(`/api/queue/${id}`);
            } else if (action === 'done') {
                await axios.post(`/api/queue/${id}/mark-done`);
            }
            onUpdate();
        } catch (err) {
            console.error(`Action ${action} failed`, err);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 lg:min-h-[420px]">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Queue</h3>
                    <p className="text-sm text-zinc-400">
                        {rotationEnabled ? 'Rotation mode: order follows singers.' : 'Drag to reorder the play list.'}
                    </p>
                </div>
            </div>
            <div className="mt-4 flex-1 min-h-0 space-y-3 overflow-y-auto">
                {queue.length === 0 ? (
                    <div className="text-sm text-zinc-500">Queue is empty.</div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={queue.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            {queue.map((item) => (
                                <SortableQueueItem
                                    key={item.id}
                                    item={item}
                                    onPlayItem={onPlayItem}
                                    onAction={handleAction}
                                    dragDisabled={!!rotationEnabled}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        </div>
    );
};

export default QueuePanel;
