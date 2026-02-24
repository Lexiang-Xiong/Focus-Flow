import type { Task } from "@/types";

export interface FlattenedTask extends Task {
  depth: number;
}

// 将树形结构打平成一维数组
// supportFocusedMode: 是否支持聚焦模式，聚焦时强制展开路径上的所有父节点
export function getFlattenedTasks(
  tasks: Task[],
  zoneId: string | null,
  focusedTaskId: string | null = null
): FlattenedTask[] {
  const zoneTasks = zoneId ? tasks.filter(t => t.zoneId === zoneId) : tasks;

  // 如果有聚焦任务，收集路径上所有祖先ID
  const ancestorIds = new Set<string>();
  if (focusedTaskId) {
    let current = tasks.find(t => t.id === focusedTaskId);
    while (current?.parentId) {
      ancestorIds.add(current.parentId);
      current = tasks.find(t => t.id === current!.parentId);
    }
  }

  // 确定根节点
  let roots: Task[];
  if (focusedTaskId) {
    // 聚焦模式：以焦点任务的子任务作为根节点
    roots = zoneTasks.filter(t => t.parentId === focusedTaskId).sort((a, b) => a.order - b.order);
  } else {
    roots = zoneTasks.filter(t => !t.parentId).sort((a, b) => a.order - b.order);
  }

  const flattened: FlattenedTask[] = [];

  function recurse(items: Task[], depth: number) {
    for (const item of items) {
      flattened.push({ ...item, depth });
      // 如果是聚焦路径上的节点，或者未折叠，则展开子任务
      const shouldExpand = ancestorIds.has(item.id) || !item.isCollapsed;
      if (shouldExpand) {
        const children = zoneTasks.filter(t => t.parentId === item.id).sort((a, b) => a.order - b.order);
        recurse(children, depth + 1);
      }
    }
  }

  recurse(roots, 0);
  return flattened;
}

// 根据拖拽位置和偏移量，计算预期的深度和父节点 ID
// 使用锚点定位法 (Anchor ID) 替代索引定位，更加稳定
export function calculateNewPosition(
  flattenedTasks: FlattenedTask[],
  activeId: string,
  overId: string,
  offsetPx: number
): { newDepth: number; newParentId: string | null; anchorId: string | null } | null {
  const activeIndex = flattenedTasks.findIndex(t => t.id === activeId);
  const overIndex = flattenedTasks.findIndex(t => t.id === overId);

  if (activeIndex === -1 || overIndex === -1) return null;

  const INDENTATION_WIDTH = 24;
  const depthOffset = Math.round(offsetPx / INDENTATION_WIDTH);

  const activeItem = flattenedTasks[activeIndex];

  // 确定视觉上的"前一个元素"
  const prevItem = flattenedTasks[overIndex - (activeIndex < overIndex ? 0 : 1)];
  const nextItem = flattenedTasks[overIndex + (activeIndex < overIndex ? 1 : 0)];

  // 1. 计算受限的深度
  let newDepth = activeItem.depth;
  if (prevItem) {
    const maxDepth = prevItem.depth + 1;
    const minDepth = nextItem ? nextItem.depth : 0;
    const calculatedDepth = activeItem.depth + depthOffset;
    newDepth = Math.max(minDepth, Math.min(maxDepth, calculatedDepth));
  } else {
    newDepth = 0; // 拖到最顶部，只能是根节点
  }

  // 2. 寻找新父节点
  let newParentId: string | null = null;
  if (newDepth > 0 && prevItem) {
    if (newDepth === prevItem.depth + 1) {
      newParentId = prevItem.id;
    } else {
      const p = flattenedTasks.slice(0, overIndex).reverse().find(t => t.depth === newDepth - 1);
      newParentId = p ? p.id : null;
    }
  }

  // 3. 寻找锚点 (Anchor ID)
  // 移除当前任务后，计算应该插入的位置
  const visibleWithoutActive = flattenedTasks.filter(t => t.id !== activeId);
  const dropIndex = activeIndex < overIndex
    ? visibleWithoutActive.findIndex(t => t.id === overId) + 1
    : visibleWithoutActive.findIndex(t => t.id === overId);

  const tasksAboveDrop = visibleWithoutActive.slice(0, dropIndex);
  const siblingsAbove = tasksAboveDrop.reverse().filter(t => t.parentId === newParentId);

  const anchorId = siblingsAbove.length > 0 ? siblingsAbove[0].id : null;

  return { newDepth, newParentId, anchorId };
}
