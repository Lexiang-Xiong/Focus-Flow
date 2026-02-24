import type { Task } from "@/types";

export interface FlattenedTask extends Task {
  depth: number;
}

// 将树形结构打平成一维数组（仅包含未被父级折叠的任务）
export function getFlattenedTasks(tasks: Task[], zoneId: string | null): FlattenedTask[] {
  const zoneTasks = zoneId ? tasks.filter(t => t.zoneId === zoneId) : tasks;
  const roots = zoneTasks.filter(t => !t.parentId).sort((a, b) => a.order - b.order);

  const flattened: FlattenedTask[] = [];

  function recurse(items: Task[], depth: number) {
    for (const item of items) {
      flattened.push({ ...item, depth });
      if (!item.isCollapsed) {
        const children = zoneTasks.filter(t => t.parentId === item.id).sort((a, b) => a.order - b.order);
        recurse(children, depth + 1);
      }
    }
  }

  recurse(roots, 0);
  return flattened;
}

// 根据拖拽位置和偏移量，计算预期的深度和父节点 ID
export function calculateNewPosition(
  flattenedTasks: FlattenedTask[],
  activeId: string,
  overId: string,
  offsetPx: number
): { newDepth: number; newParentId: string | null; overIndex: number } | null {
  const activeIndex = flattenedTasks.findIndex(t => t.id === activeId);
  const overIndex = flattenedTasks.findIndex(t => t.id === overId);

  if (activeIndex === -1 || overIndex === -1) return null;

  const INDENTATION_WIDTH = 24;
  const maxDepthOffset = Math.floor(offsetPx / INDENTATION_WIDTH);

  const activeItem = flattenedTasks[activeIndex];
  const prevItem = flattenedTasks[overIndex - (activeIndex < overIndex ? 0 : 1)];

  let newDepth = activeItem.depth;
  if (prevItem) {
    newDepth = Math.min(prevItem.depth + 1, Math.max(0, activeItem.depth + maxDepthOffset));
  } else {
    newDepth = 0;
  }

  let newParentId: string | null = null;
  if (newDepth > 0 && prevItem) {
    if (newDepth > prevItem.depth) {
      newParentId = prevItem.id;
    } else {
      const p = flattenedTasks.slice(0, overIndex).reverse().find(t => t.depth === newDepth - 1);
      newParentId = p ? p.id : null;
    }
  }

  return { newDepth, newParentId, overIndex };
}
