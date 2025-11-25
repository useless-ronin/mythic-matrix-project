// src/services/AlchemistService.ts

import { App, Notice, TFile } from 'obsidian';
import { MythicMatrixSettings } from '../constants'; // Import settings for type safety
import { LossLogService } from "./LossLogService"; // Import the LossLogService
import MythicMatrixPlugin from '../main'; // Import the main plugin class

// This interface defines the exact shape of a log entry.
export interface AlchemistLogData {
  taskText: string; // The text of the task being reflected upon
  timestamp: number; // Unix timestamp when the log was created/deferred
  topic: string; // The associated topic (e.g., extracted from [[Note Name]] in taskText)
  log: string; // The reflection log content
  understanding: string; // e.g., "🟥 Low", "🟨 Medium", "🟩 High"
  confidenceBefore: string; // e.g., "🟥 Low", "🟨 Medium", "🟩 High"
  confidenceAfter: string; // e.g., "🟥 Low", "🟨 Medium", "🟩 High"
  difficultyCauses: string[]; // List of reasons for difficulty
  fixPrinciple: string; // A principle to apply next time
  serendipitySpark: string; // An unexpected insight gained
  insight: string; // General insight from the reflection
  // --- ADD FIELD FOR ORIGINAL TASK ID (L85) ---
  originalTaskId?: string; // Optional ID of the original task (e.g., Crucible task ID) that led to this deferred log. Used for linking back and features like L85 count reset.
  // --- END ADD ---
  // Add other fields as needed for the Alchemist's Log
}

export class AlchemistService {
    private app: App;
    private settings: MythicMatrixSettings;
    private lossLogService?: LossLogService; // Store a reference to the LossLogService instance
    private plugin: MythicMatrixPlugin; // --- FIX: Store a reference to the main plugin instance ---

  // --- FIX: Accept plugin instance in constructor ---
  constructor(app: App, plugin: MythicMatrixPlugin, lossLogService?: LossLogService) {
        this.app = app;
        this.plugin = plugin; // --- FIX: Store the plugin instance ---
        this.settings = plugin.settings; // Get settings from the plugin instance
        this.lossLogService = lossLogService; // Store the service instance if provided
    }

    async saveLog(logData: AlchemistLogData): Promise<void> {
        const vault = this.app.vault;
        const folderPath = this.settings.alchemistLogFolder.trim().replace(/^\/+|\/+$/g, '') || "40 Reflections/Alchemist";

        try {
            if (!await vault.adapter.exists(folderPath)) {
                await vault.createFolder(folderPath);
            }
        } catch (err) { // --- FIX: Type the error parameter ---
            console.error("Error creating Alchemist folder:", err);
            new Notice("Error: Could not create Alchemist log folder.");
            return;
        }

        const now = new Date(logData.timestamp || Date.now());
        const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const fileName = `${timestamp} - ${logData.topic}.md`;
        const filePath = `${folderPath}/${fileName}`;

        // Build frontmatter
        const fm: Record<string, any> = { ...logData };
        delete fm.timestamp; // We use 'created' instead
        fm.created = now.toISOString();
        fm.logQuality = this.getLogQualityScore(logData);
        
        const tags = ["log"];
        if (logData.log.toLowerCase().includes("confused") || logData.difficultyCauses.length > 0) tags.push("log/confusion");
        if (logData.insight && logData.insight.trim()) tags.push("log/insight");
        if (logData.confidenceAfter === "🔼" && logData.confidenceBefore === "🔽") tags.push("log/breakthrough");
        fm.tags = tags;

        let content = "---\n";
        for (const key in fm) {
            if (fm[key] !== undefined && fm[key] !== null && fm[key] !== '') {
                if (Array.isArray(fm[key])) {
                    if (fm[key].length > 0) content += `${key}: [${fm[key].map(v => `"${v}"`).join(", ")}]\n`;
                } else {
                    content += `${key}: ${fm[key]}\n`;
                }
            }
        }
        content += "---\n\n";
        if (logData.log.trim()) content += `## Reflection\n${logData.log.trim()}\n\n`;
        if (logData.insight.trim()) content += `## Distilled Insight\n${logData.insight.trim()}\n\n`;

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile && existingFile instanceof TFile) {
            await this.app.vault.modify(existingFile, content);
            new Notice(`Log updated: ${logData.topic}`);
        } else {
            await this.app.vault.create(filePath, content);
            new Notice(`Log saved: ${logData.topic}`);
        }
    }

    private getLogQualityScore(data: Partial<AlchemistLogData>): number {
        let score = 0;
        if (data.log && data.log.trim()) score++;
        if (data.understanding && data.understanding !== "⏹️") score++;
        if (data.difficultyCauses && data.difficultyCauses.length > 0) score++;
        if (data.fixPrinciple && data.fixPrinciple.trim()) score++;
        return Math.min(score, 4);
    }

    public updateSettings(settings: MythicMatrixSettings): void {
      this.settings = settings;
      // Add any specific logic here if the service needs to react to setting changes
      console.log("[AlchemistService] Settings updated.");
  }

    // Method to process a completed deferred log entry
  public processCompletedDeferredLog(deferredEntry: AlchemistLogData, logResult: any) { // 'any' types for brevity, refine based on actual AlchemistLogData structure
    // Find the entry in the pending queue by its timestamp (or potentially by taskText if timestamp is not unique enough)
    const indexToRemove = this.settings.alchemistPending.findIndex(entry => entry.timestamp === deferredEntry.timestamp);

    if (indexToRemove !== -1) {
      // Remove the entry from the pending queue
      this.settings.alchemistPending.splice(indexToRemove, 1);

      // --- NEW: Reset Loom Deferral Count if originalTaskId is present (L85) ---
      // Check if the deferred entry contained the original task ID used for loom deferral tracking
      const originalTaskId = deferredEntry.originalTaskId;
      if (originalTaskId && this.lossLogService) { // Ensure the service instance is available
          console.log(`[AlchemistService] Processing completed deferred log for original task ID: ${originalTaskId}. Attempting to reset loom deferral count (L85).`);
          // Call the LossLogService's method to reset the count for this specific task ID
          this.lossLogService.resetLoomDeferralCount(originalTaskId);
      } else if (originalTaskId && !this.lossLogService) {
          console.warn("[AlchemistService] originalTaskId found in deferred entry, but LossLogService instance not available to reset loom deferral count (L85).");
      }
      // --- END NEW ---

      // Save the updated settings
      // --- FIX: Use the stored plugin instance to call saveSettings ---
      this.plugin.saveSettings().catch((e: any) => // --- FIX: Type the error parameter ---
        console.error("[AlchemistService] Error saving settings after processing deferred log:", e)
      );

      // Potentially emit an event
      // this.eventBus.emit('alchemist:deferred-log-processed', { deferredEntry, logResult });
    } else {
      console.error("[AlchemistService] Could not find deferred entry to remove based on timestamp.");
    }
  }

  // Method to discard a deferred log entry (e.g., user clicks 'Remove' in the hub)
  public discardDeferredLog(timestamp: number) {
    const indexToRemove = this.settings.alchemistPending.findIndex(entry => entry.timestamp === timestamp);

    if (indexToRemove !== -1) {
      // Get the entry before removing it to access originalTaskId
      const entryToDiscard = this.settings.alchemistPending[indexToRemove];

      // Remove the entry from the pending queue
      this.settings.alchemistPending.splice(indexToRemove, 1);

      // --- NEW: Reset Loom Deferral Count if originalTaskId is present (L85) ---
      // Check if the deferred entry contained the original task ID used for loom deferral tracking
      const originalTaskId = entryToDiscard.originalTaskId;
      if (originalTaskId && this.lossLogService) { // Ensure the service instance is available
          console.log(`[AlchemistService] Discarding deferred log for original task ID: ${originalTaskId}. Attempting to reset loom deferral count (L85).`);
          // Call the LossLogService's method to reset the count for this specific task ID
          this.lossLogService.resetLoomDeferralCount(originalTaskId);
      } else if (originalTaskId && !this.lossLogService) {
          console.warn("[AlchemistService] originalTaskId found in deferred entry, but LossLogService instance not available to reset loom deferral count (L85).");
      }
      // --- END NEW ---

      // Save the updated settings
      // --- FIX: Use the stored plugin instance to call saveSettings ---
      this.plugin.saveSettings().catch((e: any) => // --- FIX: Type the error parameter ---
        console.error("[AlchemistService] Error saving settings after discarding deferred log:", e)
      );

      // Potentially emit an event
      // this.eventBus.emit('alchemist:deferred-log-discarded', { entry: entryToDiscard });
    } else {
      console.error("[AlchemistService] Could not find deferred entry to discard based on timestamp.");
    }
  }
}