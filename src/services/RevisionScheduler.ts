// src/services/RevisionScheduler.ts

import { App, TFile } from 'obsidian';
import { EventBus } from './EventBus';
import { MythicMatrixSettings } from '../constants';

export class RevisionScheduler {
    app: App;
    eventBus: EventBus;
    settings: MythicMatrixSettings;
    intervals: number[];

    constructor(app: App, eventBus: EventBus, settings: MythicMatrixSettings) {
        this.app = app;
        this.eventBus = eventBus;
        this.settings = settings;
        this.intervals = settings.phoenixIntervals || [1, 3, 7, 14, 21, 30];
    }

    // --- FIX: Re-implemented from original JS ---
    public async scheduleFirstRevision(notePath: string) {
        if (!this.settings.enableRevision) return;

        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;

        const nextDate = this.addDays(new Date(), this.intervals[0]);
        await this.updateRevisionFrontmatter(file, 1, nextDate);
        this.eventBus.emit('revisionScheduled', { notePath, level: 1, nextRevision: nextDate });
    }

    public async scheduleNextRevision(notePath: string, currentLevel: number) {
        if (!this.settings.enableRevision || currentLevel >= this.intervals.length) return;
        
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;

        const nextLevel = currentLevel + 1;
        if (nextLevel > this.intervals.length) {
            await this.markAsMastered(file);
        } else {
            const nextDate = this.addDays(new Date(), this.intervals[currentLevel]);
            await this.updateRevisionFrontmatter(file, nextLevel, nextDate);
        }
    }

    public async rescheduleRevision(notePath: string, newDate: string) {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;

        const cache = this.app.metadataCache.getFileCache(file);
        const currentLevel = cache?.frontmatter?.revisionLevel || 1;
        await this.updateRevisionFrontmatter(file, currentLevel, newDate);
    }

    // --- FIX: Changed from 'private' to 'public' ---
    public addDays(date: Date, days: number): string {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result.toISOString().split('T')[0];
    }

    private async updateRevisionFrontmatter(file: TFile, level: number, nextDate: string) {
        await this.app.fileManager.processFrontMatter(file, fm => {
            fm.nextRevision = nextDate;
            fm.revisionLevel = level;
            const tags = new Set(fm.tags || []);
            for (let i = 1; i <= 6; i++) tags.delete(`revision-${i}`);
            if (level <= 6) tags.add(`revision-${level}`);
            fm.tags = [...tags];
        });
    }

    // --- FIX: Changed from 'private' to 'public' ---
    public async markAsMastered(file: TFile) {
        await this.app.fileManager.processFrontMatter(file, fm => {
            delete fm.nextRevision;
            delete fm.revisionLevel;
            const tags = new Set(fm.tags || []);
            for (let i = 1; i <= 6; i++) tags.delete(`revision-${i}`);
            tags.add('mastered');
            fm.tags = [...tags];
        });
    }

    public updateSettings(settings: MythicMatrixSettings): void {
      this.settings = settings;
      // Add any specific logic here if the service needs to react to setting changes
      // e.g., re-initialize intervals based on new settings
      console.log("[RevisionScheduler] Settings updated.");
  }

  // --- NEW: Schedule an emergency revision with a specific short interval (L52) ---
  /**
   * Schedules a revision for a specific note with a custom, short interval.
   * Intended for rapid remediation after identifying a failure (L52).
   * @param notePath - The path of the note to schedule for revision.
   * @param intervalInDays - The interval in days for the next revision (e.g., 1 for tomorrow).
   */
  public async scheduleEmergencyRevision(notePath: string, intervalInDays: number): Promise<void> {
    console.log(`[RevisionScheduler] Scheduling emergency revision for ${notePath} in ${intervalInDays} day(s). (L52)`);

    // Validate the note path exists
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found at path: ${notePath}`);
    }

    // Calculate the next revision date based on the provided interval
    const now = new Date();
    const nextRevisionDate = new Date(now);
    nextRevisionDate.setDate(now.getDate() + intervalInDays);

    // Find the note's entry in the pending revisions queue (or create one if it doesn't exist)
    // Assuming the queue structure is similar to alchemistPending, maybe called phoenixPending or revisionPending
    // and has fields like filePath, nextRevision, revisionLevel, etc.
    let revisionEntry = this.settings.revisionPending.find(item => item.filePath === notePath);

    if (revisionEntry) {
      // If it exists, update the nextRevision date and potentially reset the level if going backwards
      revisionEntry.nextRevision = nextRevisionDate.toISOString().split('T')[0]; // Store just the date YYYY-MM-DD
      // Optionally, reset the revisionLevel to 0 or 1 for an emergency revision to ensure it's treated as a fresh review
      // This depends on your specific revision level logic.
      // revisionEntry.revisionLevel = 0; // Example: reset level
      console.log(`[RevisionScheduler] Updated existing revision entry for ${notePath} to ${revisionEntry.nextRevision} (L52).`);
    } else {
      // If it doesn't exist, create a new entry
      const newEntry = {
        filePath: notePath,
        nextRevision: nextRevisionDate.toISOString().split('T')[0], // Store just the date YYYY-MM-DD
        revisionLevel: 0, // Start fresh
        // Potentially other metadata
      };
      this.settings.revisionPending.push(newEntry);
      console.log(`[RevisionScheduler] Added new emergency revision entry for ${notePath} on ${newEntry.nextRevision} (L52).`);
    }

    // Save the updated settings
    // This assumes the main plugin instance handles saving, or the service has access to it.
    // If the service has its own save method or relies on the main plugin:
    // await this.plugin.saveSettings(); // If service has reference to plugin
    // Or, if the main plugin saves settings generally after events:
    // The event emission below might trigger a general save by the main plugin.
    // For now, let's assume the main plugin listens for a revisionScheduled event and saves settings then.
    // Emit an event to signal a revision was scheduled
    this.eventBus.emit('revisionScheduled', {
      filePath: notePath,
      nextRevisionDate: nextRevisionDate,
      reason: 'emergency', // Distinguish from standard scheduling
      interval: intervalInDays
    });

    console.log(`[RevisionScheduler] Emergency revision scheduled successfully for ${notePath}.`);
  }
  // --- END NEW ---
}