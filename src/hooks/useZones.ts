import { useCallback, useMemo } from 'react';
import type { Zone, Task } from '@/types';
import { PREDEFINED_TEMPLATES } from '@/types';

export function useZones(
  zones: Zone[],
  tasks: Task[],
  onUpdateZones: (zones: Zone[]) => void,
  onUpdateTasks: (tasks: Task[]) => void
) {
  // Get zones sorted by order
  const sortedZones = useMemo(() => {
    return [...zones].sort((a, b) => a.order - b.order);
  }, [zones]);

  // Get tasks for a specific zone
  const getZoneTasks = useCallback((zoneId: string) => {
    return tasks
      .filter((t) => t.zoneId === zoneId)
      .sort((a, b) => a.order - b.order);
  }, [tasks]);

  // Add a new zone
  const addZone = useCallback((name: string, color: string) => {
    const maxOrder = zones.length > 0 ? Math.max(...zones.map((z) => z.order)) : -1;
    const newZone: Zone = {
      id: Date.now().toString(),
      name: name.trim(),
      color,
      order: maxOrder + 1,
      createdAt: Date.now(),
    };
    onUpdateZones([...zones, newZone]);
    return newZone.id;
  }, [zones, onUpdateZones]);

  // Update a zone
  const updateZone = useCallback((id: string, updates: Partial<Omit<Zone, 'id'>>) => {
    onUpdateZones(
      zones.map((zone) =>
        zone.id === id ? { ...zone, ...updates } : zone
      )
    );
  }, [zones, onUpdateZones]);

  // Delete a zone
  const deleteZone = useCallback((id: string) => {
    // Move all tasks from this zone to the default zone or delete them
    const remainingZones = zones.filter((z) => z.id !== id);
    if (remainingZones.length === 0) {
      // Create a default zone if no zones left
      const defaultZone: Zone = {
        id: 'default',
        name: '默认',
        color: '#3b82f6',
        order: 0,
        createdAt: Date.now(),
      };
      onUpdateZones([defaultZone]);
      // Move tasks to default zone
      onUpdateTasks(tasks.map((t) => (t.zoneId === id ? { ...t, zoneId: 'default' } : t)));
    } else {
      onUpdateZones(remainingZones);
      // Delete tasks in the deleted zone
      onUpdateTasks(tasks.filter((t) => t.zoneId !== id));
    }
  }, [zones, tasks, onUpdateZones, onUpdateTasks]);

  // Reorder zones
  const reorderZones = useCallback((newOrder: Zone[]) => {
    const updatedZones = newOrder.map((zone, index) => ({
      ...zone,
      order: index,
    }));
    onUpdateZones(updatedZones);
  }, [onUpdateZones]);

  // Apply a template
  const applyTemplate = useCallback((templateId: string) => {
    const template = PREDEFINED_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    // Create new zones from template
    const newZones: Zone[] = template.zones.map((zone, index) => ({
      id: `zone-${Date.now()}-${index}`,
      name: zone.name,
      color: zone.color,
      order: index,
      createdAt: Date.now(),
    }));

    onUpdateZones(newZones);
    onUpdateTasks([]); // Clear tasks for new workspace
  }, [onUpdateZones, onUpdateTasks]);

  // Get zone by id
  const getZoneById = useCallback((id: string) => {
    return zones.find((z) => z.id === id);
  }, [zones]);

  return {
    zones: sortedZones,
    getZoneTasks,
    addZone,
    updateZone,
    deleteZone,
    reorderZones,
    applyTemplate,
    getZoneById,
    templates: PREDEFINED_TEMPLATES,
  };
}
