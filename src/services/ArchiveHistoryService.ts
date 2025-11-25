// src/services/ArchiveHistoryService.ts

import { EventBus } from './EventBus';

// We can define the shape of an archive entry for better type-checking
interface ArchiveEntry {
    type: string;
    data: any;
    timestamp: Date;
}

export class ArchiveHistoryService {
    private eventBus: EventBus;
    private archiveEntries: ArchiveEntry[] = [];

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    addEntry(entry: any) {
        const newEntry: ArchiveEntry = {
            ...entry,
            timestamp: new Date()
        };
        this.archiveEntries.push(newEntry);
        this.eventBus.emit('archiveUpdated', { entry: newEntry });
    }

    getEntries(): ArchiveEntry[] {
        return this.archiveEntries;
    }

    exportArchive(): string {
        return JSON.stringify(this.archiveEntries, null, 2); // Added formatting for readability
    }
}