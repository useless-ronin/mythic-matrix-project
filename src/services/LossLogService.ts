// src/services/LossLogService.ts

import { App, Notice, normalizePath, TFile } from "obsidian";
import { EventBus } from "./EventBus"; // Assuming EventBus is defined
import {
  LossLogData,
  MythicMatrixSettings,
  DEFAULT_FAILURE_ARCHETYPES,
  EVENT_LOSS_LOGGED,
  EVENT_MINOTAUR_UPDATED,
  FailureArchetype,
  FailureType,
} from "../constants"; // Assuming interfaces/types are in constants.ts
import { v4 as uuidv4 } from "uuid"; // Add uuid as a dependency: npm install uuid @types/uuid
import MythicMatrixPlugin from "../main"; // Import the main plugin class
import { RevisionScheduler } from "./RevisionScheduler"; // Import the RevisionScheduler service


// Assuming these types are defined in constants.ts based on the spec
// export type FailureType = 'Knowledge Gap' | 'Skill Gap' | 'Process Failure';
// export type FailureArchetype = string; // Or a more specific union if the list is fixed

// --- FIND THIS INTERFACE ---
export interface PendingLossLogContext {
  sourceTask: string;
  initialFailureType?: FailureType;
  initialArchetypes?: string[];
  initialAura?: string;
  initialSyllabusTopics?: string[];
  originalTaskId?: string; // For L51, L85
  timestamp: string;
  isProactive?: boolean; // For L15
  // --- ADD THE MISSING PROPERTY HERE ---
  failureRealizationPoint?: string; // For L45
  // --- END ADD ---
}

export class LossLogService {
  private app: App;
  private eventBus: EventBus;
  private settings: MythicMatrixSettings;
  private plugin: MythicMatrixPlugin;
  // --- NEW: Store RevisionScheduler instance ---
  private revisionScheduler?: RevisionScheduler; // Optional, only if revision is enabled
  // --- END NEW ---

    constructor(app: App, eventBus: EventBus, settings: MythicMatrixSettings, plugin: MythicMatrixPlugin, revisionScheduler?: RevisionScheduler) { // Accept revisionScheduler as optional argument
    this.app = app;
    this.eventBus = eventBus;
    this.settings = settings;
    this.plugin = plugin; // Store the plugin instance
        // --- SET REVISION SCHEDULER INSTANCE ---
    this.revisionScheduler = revisionScheduler; // Store the revision scheduler instance
    // --- END SET ---
  }

  // Method to update settings if they change (e.g., via settings tab)
  public updateSettings(settings: MythicMatrixSettings): void {
    this.settings = settings;
  }

  // --- NEW/UPDATED METHODS FOR PUBLIC ACCESS (as implemented before) ---
  public getFailureArchetypes(): FailureArchetype[] {
    return this.settings.failureArchetypes;
  }

  public getCurrentMinotaur(): string {
    return this.settings.currentMinotaur;
  }

  public getLossLogFolder(): string {
    return this.settings.lossLogFolder;
  }

  public recalculateMinotaur(): Promise<void> {
    return this.updateMinotaurAsync();
  }

  public onMinotaurUpdated(callback: (payload: { oldMinotaur: string; newMinotaur: string }) => void): void {
    this.eventBus.on(EVENT_MINOTAUR_UPDATED, callback);
  }

  public offMinotaurUpdated(callback: (payload: { oldMinotaur: string; newMinotaur: string }) => void): void {
    this.eventBus.off(EVENT_MINOTAUR_UPDATED, callback);
  }

  public onLossLogged(callback: (payload: { log: LossLogData, notePath: string }) => void): void {
    this.eventBus.on(EVENT_LOSS_LOGGED, callback);
  }

  public offLossLogged(callback: (payload: { log: LossLogData, notePath: string }) => void): void {
    this.eventBus.off(EVENT_LOSS_LOGGED, callback);

  }

  // --- CORRECTED: Method to check for obsolete Ariadne's Threads (L90) ---
  public async checkThreadObsolescence(): Promise<void> {
    console.log("[LossLogService] Starting Thread Obsolescence Check (L90)...");

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const folderPath = normalizePath(this.settings.lossLogFolder);
    const allFiles = this.app.vault.getMarkdownFiles();
    const labyrinthFiles = allFiles.filter(file => file.path.startsWith(folderPath));

    const topicThreadMap: Record<string, Map<string, { timestamp: string; noteFile: TFile }>> = {};

    for (const file of labyrinthFiles) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache && cache.frontmatter) {
          
          // --- CORRECTED: Directly extract needed properties ---
          const ariadnesThread = cache.frontmatter.ariadnesThread as string || "";
          const syllabusTopics = (cache.frontmatter.syllabusTopics as string[]) || [];
          const timestamp = cache.frontmatter.timestamp as string || new Date().toISOString();
          // --- END CORRECTED ---

          if (ariadnesThread && syllabusTopics.length > 0) {
            for (const topicLink of syllabusTopics) {
              const match = topicLink.match(/\[\[([^\]]+)\]\]/);
              if (match) {
                const topicName = match[1];
                const topicFile = this.app.vault.getFiles().find(f => f.basename === topicName);
                if (topicFile) {
                  const topicPath = topicFile.path;

                  if (!topicThreadMap[topicPath]) {
                      topicThreadMap[topicPath] = new Map<string, { timestamp: string; noteFile: TFile }>();
                  }

                  const thread = ariadnesThread;

                  const currentStoredInfo = topicThreadMap[topicPath].get(thread);
                  const logTimestamp = timestamp;

                  if (!currentStoredInfo || new Date(logTimestamp) > new Date(currentStoredInfo.timestamp)) {
                      topicThreadMap[topicPath].set(thread, {
                          timestamp: logTimestamp,
                          noteFile: file
                      });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`[LossLogService] Error reading/parsing file ${file.path} for obsolescence check:`, e);
      }
    }

    // Iterate through the map to check conditions for each topic-thread pair
    for (const [topicPath, threadInfoMap] of Object.entries(topicThreadMap)) {
      try {
        const topicFile = this.app.vault.getAbstractFileByPath(topicPath);
        if (topicFile instanceof TFile) {
          const topicCache = this.app.metadataCache.getFileCache(topicFile);

          if (topicCache && topicCache.frontmatter) {
            const myConfidence = topicCache.frontmatter.MyConfidence as number;

            if (myConfidence >= 4) {
              // --- CORRECTED SCOPE: Iterate threads and check individually ---
              for (const [thread, threadInfo] of threadInfoMap.entries()) {
                  const logDate = new Date(threadInfo.timestamp); // logDate is specific to this iteration

                  if (logDate < thirtyDaysAgo) {
                    console.log(
                      `[LossLogService] Ariadne's Thread obsolescence detected for topic '${topicPath}': Thread "${thread}" (from log note ${threadInfo.noteFile.path}, last failure on ${logDate.toISOString().split('T')[0]}). MyConfidence is ${myConfidence}.`
                    );

                    const originalLogNoteFile = threadInfo.noteFile;

                    const originalLogContent = await this.app.vault.read(originalLogNoteFile);
                    if (!originalLogContent.includes("#thread/archived")) {
                        let updatedContent = originalLogContent; // Renamed from 'modifiedContent' to match typical naming
                        const frontmatterMatch = originalLogContent.match(/^---\n([\s\S]*?)\n---\n/);

                        if (frontmatterMatch) {
                            const currentFrontmatter = frontmatterMatch[1];
                            const statusFieldMatch = currentFrontmatter.match(/^(labyrinthStatus:\s*(.*))/m);
                            if (statusFieldMatch) {
                                const currentStatus = statusFieldMatch[2].trim();
                                if (!currentStatus.includes('archived')) {
                                    const newStatus = currentStatus.endsWith(',') ? `${currentStatus} archived` : `${currentStatus}, archived`;
                                    updatedContent = originalLogContent.replace(
                                        statusFieldMatch[0],
                                        `labyrinthStatus: ${newStatus}`
                                    );
                                }
                            } else {
                                const newFrontmatter = `${currentFrontmatter}\nlabyrinthStatus: archived`;
                                updatedContent = originalLogContent.replace(
                                    frontmatterMatch[0],
                                    `---\n${newFrontmatter}\n---\n`
                                );
                            }
                        } else {
                            updatedContent = `${originalLogContent}\n\n#thread/archived`;
                        }

                        await this.app.vault.modify(originalLogNoteFile, updatedContent);
                        console.log(`[LossLogService] Marked original loss log note '${originalLogNoteFile.path}' as #thread/archived (L90).`);
                    } else {
                        console.log(`[LossLogService] Original loss log note '${originalLogNoteFile.path}' already marked as #thread/archived (L90). Skipping.`);
                    }
                  } else {
                    // This log message now correctly refers to the specific thread and its log date within the loop
                    console.log(
                      `[LossLogService] Ariadne's Thread for topic '${topicPath}' ('${thread}') is still active: Last failure log containing this thread was on ${logDate.toISOString().split('T')[0]} (less than 30 days ago). MyConfidence is ${myConfidence}.`
                    );
                  }
              }
              // --- END CORRECTED SCOPE ---
            } else {
              // --- CORRECTED SCOPE: Iterate threads again for the 'confidence too low' case ---
              console.log(
                `[LossLogService] Ariadne's Threads for topic '${topicPath}' are still active: MyConfidence is ${myConfidence} (< 4).`
              );
              for (const [thread, threadInfo] of threadInfoMap.entries()) { // Re-iterate threadInfoMap for this topic
                  const logDate = new Date(threadInfo.timestamp); // Get the specific logDate for this thread
                  if (logDate < thirtyDaysAgo) {
                    // This log message now correctly refers to the specific thread and its log date within this loop
                    console.log(
                      `[LossLogService] Ariadne's Thread for topic '${topicPath}' ('${thread}') is still active despite old log: MyConfidence is ${myConfidence} (< 4). Last failure was on ${logDate.toISOString().split('T')[0]}.`
                    );
                  } else {
                      // Log if the log is recent but confidence is low
                      console.log(
                        `[LossLogService] Ariadne's Thread for topic '${topicPath}' ('${thread}') is still active: MyConfidence is ${myConfidence} (< 4) but last failure was on ${logDate.toISOString().split('T')[0]} (less than 30 days ago).`
                      );
                  }
              }
              // --- END CORRECTED SCOPE ---
            }
          } else {
            console.log(`[LossLogService] Could not find frontmatter for topic note '${topicPath}' to check MyConfidence (L90). Skipping.`);
          }
        } else {
          console.log(`[LossLogService] Could not find topic file '${topicPath}' (L90). Skipping.`); // Fixed typo: L99 -> L90
        }
      } catch (e) {
        console.error(`[LossLogService] Error checking obsolescence for topic '${topicPath}':`, e);
      }
    }

    console.log("[LossLogService] Finished Thread Obsolescence Check (L90).");
  }
  // --- END CORRECTED ---

// --- REFINED: Method to increment the deferral count for a specific Weaver's Loom task (L85) ---
  /**
   * Increments the deferral count for a specific Weaver's Loom task.
   * This method is called by other parts of the system (e.g., FeedbackModal) when a loom task is deferred.
   * It assumes the 'taskId' corresponds to an ID within the system where loom tasks can be deferred
   * (e.g., an ID from plugin.settings.tasks if the loom task is stored there).
   * @param taskId - The unique ID of the task whose deferral count should be incremented.
   */
  public incrementLoomDeferralCount(taskId: string): void {
    console.log(`[LossLogService] Incrementing deferral count for loom task ID: ${taskId} (L85)`);
    // Ensure the settings object has the deferral counts map
    if (!this.plugin.settings.loomDeferralCounts) {
      this.plugin.settings.loomDeferralCounts = {};
    }

    // Get the current count, defaulting to 0 if not found
    const currentCount = this.plugin.settings.loomDeferralCounts[taskId] || 0;
    // Increment the count
    const newCount = currentCount + 1;
    // Update the count in settings
    this.plugin.settings.loomDeferralCounts[taskId] = newCount;

    // Save the settings to persist the change
    this.plugin.saveSettings().catch((e) =>
      console.error("[LossLogService] Error saving settings after incrementing loom deferral count:", e)
    );

    console.log(`[LossLogService] Deferral count for loom task ${taskId} is now ${newCount} (L85).`);
  }

  // --- REFINED: Method to get the current deferral count for a specific Weaver's Loom task (L85) ---
  /**
   * Gets the current deferral count for a specific Weaver's Loom task.
   * This method is called by other parts of the system (e.g., FeedbackModal) to check the threshold.
   * @param taskId - The unique ID of the task whose deferral count is requested.
   * @returns The number of times the task has been deferred.
   */
  public getLoomDeferralCount(taskId: string): number {
    // Return the count from settings, defaulting to 0 if the map doesn't exist or the task ID is not found.
    return this.plugin.settings.loomDeferralCounts?.[taskId] || 0;
  }
  // --- END REFINED ---

  /**
   * Resets the deferral count for a specific Weaver's Loom task.
   * Called by the service itself when a failure related to this task is logged via L85 prompt.
   * @param taskId - The unique ID of the Weaver's Loom task.
   */

  // --- REFINED: Method to reset the deferral count for a specific Weaver's Loom task (L85) ---
  /**
   * Resets the deferral count for a specific Weaver's Loom task in settings.
   * @param taskId - The unique ID of the task in plugin.settings.tasks.
   */
  public resetLoomDeferralCount(taskId: string): void {
    console.log(`[LossLogService] Resetting deferral count for loom task: ${taskId}`);
    // Find the task in the plugin settings' loom deferral counts map
    if (this.plugin.settings.loomDeferralCounts && this.plugin.settings.loomDeferralCounts.hasOwnProperty(taskId)) {
      this.plugin.settings.loomDeferralCounts[taskId] = 0;

      // Save the updated settings
      this.plugin.saveSettings().catch((e) =>
        console.error("[LossLogService] Error saving settings after resetting loom deferral count:", e)
      );

      console.log(`[LossLogService] Deferral count for loom task ${taskId} has been reset to 0.`);
    } else {
        console.log(`[LossLogService] No deferral count found for loom task ID "${taskId}" to reset.`);
    }
  }
  // --- END REFINED ---

  /**
   * Creates a new loss log note based on the provided LossLogData.
   * @param lossData - The structured data representing the failure and insights.
   * @returns A Promise resolving to the path of the created note.
   */
  public async createLossLog(lossData: LossLogData): Promise<string> {
    try {
      // Ensure the Labyrinth folder exists
      const folderPath = normalizePath(this.settings.lossLogFolder);
      await this.ensureFolderExists(folderPath);

      // Generate filename using timestamp (ISO 8601, unique per minute as per spec)
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${timestamp}.md`;
      const notePath = normalizePath(`${folderPath}/${fileName}`);

      // --- Generate the failure tag for this *creation* event ---
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
      const failureTag = `#failed-on-${dateStr}`;
      // --- END NEW ---

      // --- NEW: Check for Decay Correlation (L82) ---
      // This requires checking the source notes linked in syllabusTopics for their decay_risk.
      // If any linked note has decay_risk > 3, add the #failure/faded-ink tag.
      let shouldAddFadedInkTag = false;
      if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
        for (const topicLink of lossData.syllabusTopics) {
          // Extract the actual note name from the link format "[[Note Name]]"
          const match = topicLink.match(/\[\[([^\]]+)\]\]/);
          if (match) {
            const topicName = match[1];
            // Find the corresponding TFile
            const topicFile = this.app.vault.getFiles().find(f => f.basename === topicName);
            if (topicFile) {
              // Read the topic note's frontmatter to check decay_risk
              try {
                const topicContent = await this.app.vault.read(topicFile);
                const topicCache = this.app.metadataCache.getFileCache(topicFile);
                if (topicCache && topicCache.frontmatter) {
                  const decayRisk = topicCache.frontmatter.decay_risk as number;
                  if (decayRisk && decayRisk > 3) {
                    console.log(`[LossLogService] Found topic ${topicFile.path} with decay_risk ${decayRisk} > 3. Applying #failure/faded-ink tag (L82).`);
                    shouldAddFadedInkTag = true;
                    break; // Found one, no need to check others
                  }
                }
              } catch (e) {
                console.error(`[LossLogService] Error reading topic file ${topicFile.path} for decay check:`, e);
                // Optionally continue to check other topics or handle the error differently
                // For now, just log and continue.
              }
            }
          }
        }
      }
      // --- END NEW ---

      // --- NEW: Generate proactive tag if applicable (L15) ---
      const proactiveTag = lossData.provenance?.origin === "scrying-pool" ? " #loss/future-risk" : "";
      // --- END NEW ---

      // --- NEW: Generate faded ink tag if applicable (L82) ---
      const fadedInkTag = shouldAddFadedInkTag ? " #failure/faded-ink" : "";
      // --- END NEW ---

      // Prepare frontmatter content, including the failure tag and potentially the proactive/faded-ink tag
      const frontmatterYaml = this.generateFrontmatterYaml(lossData, failureTag); // Pass the tag

      // Prepare body content, including the failure tag and potentially the proactive/faded-ink tag
      let bodyContent = this.generateBodyContent(lossData, failureTag); // Pass the tag
      // Append proactive or faded-ink tags to the body if applicable
      if (proactiveTag) {
          bodyContent += `\n\n${proactiveTag}`;
      }
      if (fadedInkTag) {
          bodyContent += `\n\n${fadedInkTag}`;
      }

      // Combine frontmatter and body
      const noteContent = `---\n${frontmatterYaml}---\n\n${bodyContent}`;

      // Create the note file
      const file = await this.app.vault.create(notePath, noteContent);

// --- NEW: Auto-Tag Original Source Based on Context (L51, L24) ---
      // Attempt to tag the source if a sourceTaskId is provided in provenance
      // This handles tagging based on the ID (e.g., Crucible task ID or file path).
      if (lossData.provenance?.sourceTaskId) {
        const sourceTaskId = lossData.provenance.sourceTaskId;
        // Determine if the sourceTaskId is a file path or a Crucible task ID
        // A simple heuristic: if it contains a '.' (like '.md') or '/' (like 'folder/file.md'), it's likely a path.
        // Otherwise, assume it's a Crucible task ID.
        if (this.isFilePath(sourceTaskId)) {
            await this.autoTagOriginalTask(sourceTaskId, new Date(), failureTag); // Pass the generated tag
            console.log(`[LossLogService] Attempted to auto-tag source note ${sourceTaskId} via autoTagOriginalTask.`);
        } else {
            await this.tagCrucibleTask(sourceTaskId, failureTag); // Pass the specific tag generated for this log
            console.log(`[LossLogService] Attempted to auto-tag Crucible task ${sourceTaskId} via tagCrucibleTask.`);
        }
      } else {
          console.log(`[LossLogService] No sourceTaskId provided for log ${file.path}. Skipping auto-tagging of original task by ID (L51).`);
      }

      // --- NEW: Check sourceTask Text for #blocked Tag (L24) and Apply Specific Tag ---
      // This adds a layer of analysis based on the *content* of the source task itself.
      if (lossData.sourceTask.includes("#blocked")) {
          console.log(`[LossLogService] Source task text "${lossData.sourceTask}" contains #blocked. Applying #failure/dependency-blocked tag and potentially tagging the source (L24, L51).`);

          // 1. Apply a specific tag to the *newly created* loss log note itself
          // This helps identify logs specifically related to dependency/blocking issues.
          let updatedNoteContent = noteContent;
          const frontmatterEndMatch = noteContent.match(/(---\n[\s\S]*?\n---\n)/);
          if (frontmatterEndMatch) {
              const frontmatterBlock = frontmatterEndMatch[0];
              const frontmatterContent = frontmatterEndMatch[1];
              // Check if the specific dependency failure tag already exists in the frontmatter to avoid duplicates
              if (!frontmatterContent.includes("#failure/dependency-blocked")) {
                  // Add the tag to a dedicated field in the log note's frontmatter, e.g., 'labyrinthStatus' or 'failureTags'
                  // Using 'failureTags' as it's already defined in the frontmatter structure.
                  const failureTagsMatch = frontmatterContent.match(/^(failureTags:\s*\[([^\]]*)\])/m);
                  if (failureTagsMatch) {
                      // If failureTags field exists, append the new tag
                      const existingTags = failureTagsMatch[2].trim();
                      const newTags = existingTags ? `${existingTags}, "#failure/dependency-blocked"` : `"#failure/dependency-blocked"`;
                      updatedNoteContent = noteContent.replace(
                          failureTagsMatch[0],
                          `failureTags: [${newTags}]`
                      );
                  } else {
                      // If no failureTags field exists, add it
                      const newFrontmatter = `${frontmatterContent}\nfailureTags: ["${failureTag.replace('#failed-on-', '')}", "#failure/dependency-blocked"]`; // Add both the date tag and the dependency tag
                      updatedNoteContent = noteContent.replace(
                          frontmatterEndMatch[0],
                          `---\n${newFrontmatter}\n---\n`
                      );
                  }
              } else {
                  console.log(`[LossLogService] #failure/dependency-blocked tag already exists in the frontmatter of the new log ${file.path}. Skipping.`);
              }
          } else {
              // If no standard frontmatter is found, append the tag to the body content
              // Less ideal than frontmatter, but ensures the tag is present in the note.
              if (!noteContent.includes("#failure/dependency-blocked")) {
                  updatedNoteContent = `${noteContent}\n\n#failure/dependency-blocked`;
              } else {
                  console.log(`[LossLogService] #failure/dependency-blocked tag already exists in the body of the new log ${file.path}. Skipping.`);
              }
          }

          // If the content was updated, write it back to the file
          if (updatedNoteContent !== noteContent) {
              await this.app.vault.modify(file, updatedNoteContent);
              console.log(`[LossLogService] Added #failure/dependency-blocked tag to the loss log note ${file.path}.`);
          }

          // 2. (Potentially) Tag the *original source task* again, specifically for the dependency aspect.
          // This is more complex because the sourceTask text itself might contain a link [[Note Name]].
          // If it does, we could attempt to tag that specific note *again* with the dependency tag.
          // This reinforces L51 by adding more specific context to the *original* source.
          const noteLinkMatch = lossData.sourceTask.match(/\[\[([^\]]+)\]\]/);
          if (noteLinkMatch) {
              const noteBasename = noteLinkMatch[1];
              const sourceNoteFile = this.app.vault.getFiles().find(f => f.basename === noteBasename);
              if (sourceNoteFile) {
                  console.log(`[LossLogService] Identified source note link [[${noteBasename}]] in source task text. Attempting to add #failure/dependency-blocked tag to the note itself (L24, L51).`);
                  // Re-use the autoTagOriginalTask logic, but pass the dependency-specific tag
                  await this.autoTagOriginalTask(sourceNoteFile.path, new Date(), "#failure/dependency-blocked");
              } else {
                  console.log(`[LossLogService] Could not find source note file for link [[${noteBasename}]] mentioned in source task text for dependency tagging (L24).`);
              }
          } else {
              console.log(`[LossLogService] Source task text "${lossData.sourceTask}" does not contain a note link [[Note Name]]. Skipping direct source note tagging based on text content for dependency failure (L24).`);
          }
      } else {
          console.log(`[LossLogService] Source task text "${lossData.sourceTask}" does not contain #blocked. Skipping dependency failure tagging logic (L24).`);
      }
      // --- END NEW ---

      // --- NEW: Reset Deferral Count for L85 (if sourceTaskId is provided) ---
      // If the log was created from a context that knew the original task ID (e.g., via FeedbackModal prompt),
      // reset the deferral count for that task ID in settings.
      // This prevents the L85 prompt from appearing again immediately after a failure is logged for the same task.
      const originalTaskId = lossData.provenance?.sourceTaskId;
      if (originalTaskId) {
          console.log(`[LossLogService] Log created for original task ID: ${originalTaskId}. Attempting to reset deferral count (L85).`);
          if (this.plugin.settings.loomDeferralCounts && this.plugin.settings.loomDeferralCounts.hasOwnProperty(originalTaskId)) {
              // Reset the count for this specific task ID to 0
              this.plugin.settings.loomDeferralCounts[originalTaskId] = 0;
              console.log(`[LossLogService] Deferral count for task ${originalTaskId} reset to 0 (L85).`);
              // Save the settings to persist the change
              await this.plugin.saveSettings();
          } else {
              console.log(`[LossLogService] Original task ID ${originalTaskId} not found in weaverLoomDeferralCounts or counts object doesn't exist. No count to reset (L85).`);
          }
      } else {
          console.log(`[LossLogService] No originalTaskId found in provenance for log ${file.path}. Skipping deferral count reset (L85).`);
      }
      // --- END NEW ---

       // --- NEW: Reset Loom Deferral Count if log originated from L85 prompt (L85) ---
      // Check if the log was created *in response* to a prompt (e.g., from FeedbackModal's L85 confirm).
      // This is indicated by the provenance.sourceTaskId being a Crucible task ID (from settings.tasks) AND the origin being 'manual' or 'quick-log'.
      // The prompt likely occurred because the deferral count for this task ID reached the threshold.
      // Logging the failure via the prompt acknowledges the repeated deferral. Reset the count.
      const origin = lossData.provenance?.origin;
      const sourceTaskId = lossData.provenance?.sourceTaskId;

      if (sourceTaskId && (origin === "manual" || origin === "quick-log" || origin === "scrying-pool-quick")) {
          // The log was created manually (or via quick log) and has a sourceTaskId.
          // Assume this sourceTaskId corresponds to a Crucible task ID if it doesn't look like a file path.
          // A simple heuristic: if it doesn't contain '.' or '/', it's likely an ID.
          // This matches the logic potentially used in tagCrucibleTask.
          if (!this.isFilePath(sourceTaskId)) {
              console.log(`[LossLogService] New log created for Crucible task ID ${sourceTaskId} (origin: ${origin}). Resetting loom deferral count (L85).`);
              // Reset the deferral count for this specific task ID
              this.resetLoomDeferralCount(sourceTaskId);
              // The resetLoomDeferralCount method already saves settings internally.
          } else {
              // If sourceTaskId looks like a file path, it probably came from a scrying pool or other note-linked context, not a Crucible deferral prompt.
              console.log(`[LossLogService] New log created for note path ${sourceTaskId} (origin: ${origin}). Skipping loom deferral count reset for L85.`);
          }
      } else {
          console.log(`[LossLogService] Log origin (${origin}) or sourceTaskId (${sourceTaskId}) not matching L85 prompt criteria. Skipping deferral count reset.`);
      }
      // --- END NEW ---


       // --- NEW: Trigger VOI Review (L53) ---
      // Check if the logged failure archetype is related to source deficit
      const sourceDeficitArchetypes = ["source-deficit", "credibility-gap", "information-deficit"]; // Define relevant archetypes
      const isSourceDeficit = lossData.failureArchetypes.some(archetype => sourceDeficitArchetypes.includes(archetype));

      if (isSourceDeficit) {
        console.log(`[LossLogService] Logged failure contains source-deficit archetype (${lossData.failureArchetypes.join(", ")}). Triggering VOI review (L53).`);

         // --- PLACEHOLDER: Option 1 - Show a Notice ---
        new Notice("VOI Review trigger (L53) is planned for future implementation.");
        // --- END PLACEHOLDER Option 1 ---

        // --- IMPLEMENTATION DEPENDS ON VOI SYSTEM ---
        // Example: Create a new task in the Crucible queue or a dedicated VOI queue
        // This requires access to the task management system or a specific VOI service.
        // Assuming a method exists on the main plugin or a dedicated service:
        // this.plugin.createVOIReviewTask(lossData.syllabusTopics); // Example call
        // Or, add to a specific VOI queue in settings:
        // this.plugin.settings.voiPending.push({ relatedTopics: lossData.syllabusTopics, originalLogPath: file.path, timestamp: Date.now() });
        // this.plugin.saveSettings();

        // For now, let's assume there's a method on the main plugin to add a VOI task.
        // This is a placeholder call.
        // The actual implementation depends on how the VOI (Value of Information) system is designed.
        // if (this.plugin.voiService) {
        //     this.plugin.voiService.createReviewTask(lossData.syllabusTopics, file.path);
        // } else {
        //     console.warn("[LossLogService] VOI service not found. Cannot trigger VOI review (L53).");
        // }
        // A simpler approach might be to create a standard task in the Crucible.
        // Example placeholder logic:
        const voiTaskText = `Re-assess credibility and value of source material for: ${lossData.syllabusTopics.join(", ")}. Log: [[${file.basename}]]`;
        // Add this task to the main task list in settings
        // this.plugin.settings.tasks.push({ id: Date.now().toString(36), text: voiTaskText, created: Date.now() });
        // this.plugin.saveSettings();
        // new Notice(`VOI Review task created for: ${lossData.syllabusTopics.join(", ")}. (L53)`);
        // This requires access to the main plugin instance.
        // Let's assume the service has access to the main plugin instance via 'this.plugin'.
        // The plugin instance would need a method or settings access to add tasks.
        // this.plugin.addTask(voiTaskText); // If such a method exists
        // Or directly manipulate settings if available:
        // this.plugin.settings.tasks.push({ id: Date.now().toString(36), text: voiTaskText, created: Date.now() });
        // this.plugin.saveSettings();
        // For this example, let's assume a method 'createVOIReviewTask' exists on the main plugin instance.
        // The service needs access to the main plugin instance.
        // This requires passing the main plugin instance to the LossLogService constructor (done previously).
        // Then call: this.plugin.createVOIReviewTask(...);
         // --- ORIGINAL CODE (Commented out due to error) ---
        // if (typeof this.plugin.createVOIReviewTask === 'function') {
        //     this.plugin.createVOIReviewTask(lossData.syllabusTopics, file.path);
        //     new Notice(`VOI Review task created for: ${lossData.syllabusTopics.join(", ")}. (L53)`);
        // } else {
        //     console.warn("[LossLogService] Method 'createVOIReviewTask' not found on main plugin instance. Cannot trigger VOI review (L53).");
        // }
        // --- END ORIGINAL CODE ---
      }
      // --- END NEW ---

      // --- NEW: Update Digital Garden Status (L55) ---
      // Check the syllabus topics and update their garden status if they are garden notes
      if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
        console.log(`[LossLogService] Updating garden status for topics: ${lossData.syllabusTopics.join(", ")} (L55).`);

        for (const topicLink of lossData.syllabusTopics) {
          // Extract the actual note name from the link format "[[Note Name]]"
          const match = topicLink.match(/\[\[([^\]]+)\]\]/);
          if (match) {
            const topicName = match[1];
            // Find the corresponding TFile
            const topicFile = this.app.vault.getFiles().find(f => f.basename === topicName);
            if (topicFile) {
              try {
                // Read the current content of the topic file
                const content = await this.app.vault.read(topicFile);
                const cache = this.app.metadataCache.getFileCache(topicFile);

                if (cache && cache.frontmatter) {
                  // Check if the note has a 'gardenStatus' field in frontmatter
                  const currentGardenStatus = cache.frontmatter.gardenStatus as string;
                  if (currentGardenStatus) {
                    // Define the downgrade logic (e.g., 🌳 -> 🍂, 🍂 -> 🍁, 🍁 -> ❄️)
                    // This is a simple example, the actual rules might differ.
                    let newGardenStatus = currentGardenStatus;
                    if (currentGardenStatus.includes("🌳")) { // Evergreen
                        newGardenStatus = currentGardenStatus.replace("🌳", "🍂"); // Downgrade to Wilted
                        console.log(`[LossLogService] Downgrading garden status for ${topicFile.path} from '${currentGardenStatus}' to '${newGardenStatus}' (L55).`);
                    } else if (currentGardenStatus.includes("🍂")) { // Wilted
                        newGardenStatus = currentGardenStatus.replace("🍂", "🍁"); // Downgrade to Decayed
                        console.log(`[LossLogService] Downgrading garden status for ${topicFile.path} from '${currentGardenStatus}' to '${newGardenStatus}' (L55).`);
                    }
                    // Add more downgrade rules if needed (e.g., 🍁 -> ❄️)

                    // If the status needs to change
                    if (newGardenStatus !== currentGardenStatus) {
                      // Update the frontmatter
                      const updatedContent = content.replace(
                        /^(gardenStatus:\s*)(.*)$/m, // Match the gardenStatus line
                        `$1${newGardenStatus}`       // Replace its value
                      );

                      // Write the updated content back to the file
                      await this.app.vault.modify(topicFile, updatedContent);
                      console.log(`[LossLogService] Updated garden status for ${topicFile.path} to ${newGardenStatus}. (L55)`);
                    } else {
                        console.log(`[LossLogService] Garden status for ${topicFile.path} (${currentGardenStatus}) is already low. No downgrade needed (L55).`);
                    }
                  } else {
                    console.log(`[LossLogService] Note ${topicFile.path} does not have a 'gardenStatus' field in frontmatter. Skipping garden status update (L55).`);
                  }
                } else {
                  console.log(`[LossLogService] Could not read frontmatter for ${topicFile.path} to update garden status (L55).`);
                }
              } catch (e) {
                console.error(`[LossLogService] Error updating garden status for ${topicFile.path} (L55):`, e);
                // Optionally show a notice to the user
                // new Notice(`Failed to update garden status for ${topicName}. Check console.`);
              }
            } else {
              console.log(`[LossLogService] Could not find file for topic link: ${topicLink}. Skipping garden status update (L55).`);
            }
          } else {
            console.log(`[LossLogService] Topic link "${topicLink}" is not in the expected format [[Note Name]]. Skipping garden status update (L55).`);
          }
        }
      }
      // --- END NEW ---


// --- NEW: Trigger Emergency Revision (L52) ---
      // Schedule an immediate revision for the topics linked in the log
      // This requires access to the RevisionScheduler service via the main plugin instance.
      // It assumes the RevisionScheduler has a method like 'scheduleEmergencyRevision'.
      if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
        console.log(`[LossLogService] Attempting to schedule emergency revision for topics: ${lossData.syllabusTopics.join(", ")} (L52)`);

        // Access the revision scheduler instance stored in this service
        // This assumes the LossLogService was instantiated with the revisionScheduler instance passed from main.ts
        if (this.revisionScheduler && typeof this.revisionScheduler.scheduleEmergencyRevision === 'function') {
          // Loop through the syllabus topics and schedule an emergency revision for each linked note found
          for (const topicLink of lossData.syllabusTopics) {
            // Extract the actual note name from the link format "[[Note Name]]"
            const topicNameMatch = topicLink.match(/\[\[([^\]]+)\]\]/);
            if (topicNameMatch) {
              const topicName = topicNameMatch[1];
              // Find the corresponding TFile
              const topicFile = this.app.vault.getFiles().find(f => f.basename === topicName);
              if (topicFile) {
                // Call the emergency revision scheduling method
                // The interval could be configurable, but let's hardcode 1 day for now.
                const emergencyInterval = 1; // Day
                try {
                  // Assuming scheduleEmergencyRevision takes (filePath: string, intervalInDays: number)
                  await this.revisionScheduler.scheduleEmergencyRevision(topicFile.path, emergencyInterval);
                  console.log(`[LossLogService] Scheduled emergency revision for topic: ${topicName} (Path: ${topicFile.path}) (L52)`);
                } catch (e) {
                  console.error(`[LossLogService] Failed to schedule emergency revision for topic ${topicName} (Path: ${topicFile.path}):`, e);
                  // Optionally show a notice to the user
                  // new Notice(`Failed to schedule emergency revision for ${topicName}. Check console.`);
                }
              } else {
                console.log(`[LossLogService] Could not find file for topic link: ${topicLink}. Skipping emergency revision scheduling. (L52)`);
              }
            } else {
              console.log(`[LossLogService] Topic link "${topicLink}" is not in the expected format [[Note Name]]. Skipping. (L52)`);
            }
          }
        } else {
          // If the revisionScheduler or the required method is not available, log a warning.
          // This might happen if the revision feature is disabled or the method name is different.
          console.warn("[LossLogService] RevisionScheduler or 'scheduleEmergencyRevision' method not found. Emergency revision (L52) skipped.");
          // Optionally show a notice to the user if this is a critical feature
          // new Notice("Emergency revision scheduling (L52) is not available. Is the Revision module enabled?");
        }
      } else {
          console.log(`[LossLogService] No syllabus topics found in log data. Skipping emergency revision scheduling. (L52)`);
      }
      // --- END NEW ---

      // Emit the lossLogged event
      this.eventBus.emit(EVENT_LOSS_LOGGED, {
        log: lossData,
        notePath: file.path,
      });

     // Update Minotaur after logging (asynchronously, don't block the save)
      this.updateMinotaurAsync().catch((e) =>
        console.error("[LossLogService] Error updating Minotaur:", e)
      );

      // Optional: Provide user feedback
      new Notice(`Labyrinth: ${lossData.provenance?.origin === "scrying-pool" ? "Risk" : "Failure"} logged successfully.`);

      return file.path;
    } catch (error) {
      console.error("Error creating loss log:", error);
      new Notice(`Failed to create loss log note for ${lossData.provenance?.origin === "scrying-pool" ? "risk" : "failure"}.`);
      throw error; // Re-throw to handle upstream if necessary
    }
  }

  // --- NEW HELPER: Determine if an identifier is a file path (L51) ---
  private isFilePath(identifier: string): boolean {
    // A simple heuristic: if it contains a '.' (like '.md') or '/' (like 'folder/file.md'), it's likely a path.
    // This is a basic check; a more robust one might involve checking if it ends with a known extension.
    // For now, checking for '/' or '.' seems reasonable.
    return identifier.includes('/') || identifier.includes('.');
  }
  // --- END NEW HELPER ---

  /**
   * Adds a loss log context object to the pending queue for later processing in the Mythos Hub.
   * @param pendingContext - The data for the log context to be deferred.
   */
  public addPendingLog(pendingContext: PendingLossLogContext): void {
    const updatedPendingLogs = [...this.settings.lossLogPending, pendingContext]; // Assuming settings.lossLogPending is now PendingLossLogContext[]
    // Update settings object (the main plugin instance will handle saving to disk)
    this.settings.lossLogPending = updatedPendingLogs;
    // Optionally, emit an event if the UI needs to react instantly
    // this.eventBus.emit('pendingLossLogsUpdated', updatedPendingLogs);
    new Notice("Labyrinth: Failure logged for later reflection.");
  }



  /**
   * Clears the pending loss log queue. Typically called on weekly reset.
   */
  public clearPendingLogs(): void {
    this.settings.lossLogPending = [];
    // this.eventBus.emit('pendingLossLogsUpdated', []);
  }

   /**
   * Generates the YAML frontmatter string from LossLogData.
   * @param data - The LossLogData object.
   * @param failureTag - The tag to add indicating the failure date.
   * @returns A string containing the YAML frontmatter.
   */
  private generateFrontmatterYaml( data:LossLogData, failureTag: string): string { // Accept the tag
    // Convert arrays and objects to YAML format, escaping quotes where necessary
    const lines = [
      `lossId: "${data.lossId}"`,
      `sourceTask: "${data.sourceTask.replace(/"/g, '\\"')}"`, // Escape quotes in source task, keep original text
      `failureType: "${data.failureType}"`,
      `failureArchetypes: [${data.failureArchetypes.map((a) => `"${a}"`).join(", ")}]`,
      `impact: ${data.impact}`,
      `syllabusTopics: [${data.syllabusTopics.map((t) => `"${t}"`).join(", ")}]`,
      `syllabusPapers: [${data.syllabusPapers.map((p) => `"${p}"`).join(", ")}]`,
      `aura: "${data.aura}"`,
      ...(data.emotionalState ? [`emotionalState: "${data.emotionalState}"`] : []),
      `rootCauseChain: [${data.rootCauseChain.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(", ")}]`, // Escape quotes in causes
      `ariadnesThread: "${data.ariadnesThread.replace(/"/g, '\\"')}"`, // Escape quotes in thread
      ...(data.counterFactual ? [`counterFactual: "${data.counterFactual.replace(/"/g, '\\"')}"`] : []),
      ...(data.evidenceLink ? [`evidenceLink: "${data.evidenceLink}"`] : []),
      ...(data.linkedMockTest ? [`linkedMockTest: "${data.linkedMockTest}"`] : []),
      // --- ADD NEW FIELD TO FRONTMATTER (L45) ---
      ...(data.failureRealizationPoint ? [`failureRealizationPoint: "${data.failureRealizationPoint}"`] : []),
      // --- END ADD ---
      `timestamp: "${data.timestamp}"`,
      `provenance:`,
      `  origin: "${data.provenance?.origin || "manual"}"`,
      ...(data.provenance?.sourceTaskId ? [`  sourceTaskId: "${data.provenance.sourceTaskId}"`] : []),
      // Add the tag to a dedicated field in the log note's frontmatter
      `failureTags: ["${failureTag}"]`,
      // --- ADD PROACTIVE TAG TO FRONTMATTER (L15) ---
      ...(data.provenance?.origin === "scrying-pool" ? [`  isFutureRisk: true`] : []), // Add a boolean field to denote proactive logs
      // --- END ADD ---
    ];
    return lines.join("\n") + "\n";
  }
  /**
   * Generates the body content of the loss log note.
   * @param data - The LossLogData object.
   * @param failureTag - The tag to add indicating the failure date.
   * @returns A string containing the markdown body.
   */
  private generateBodyContent( data: LossLogData, failureTag: string): string { // Accept the tag
    const parts = [];
    // Add the tag at the very beginning of the body
    parts.push(failureTag);
    parts.push(""); // Add a blank line after the tag

    parts.push("## Log");
    parts.push(
      `During ${data.syllabusPapers.join(", ")}, ${data.sourceTask} ${
        data.provenance?.origin === "scrying-pool" ? "is anticipated to result in" : "resulted in"
      } a failure.`
    );
    parts.push(""); // Add a blank line

    // --- ADD NEW METRIC TO BODY (L45) ---
    if (data.failureRealizationPoint) {
        parts.push("## Failure Realization Point");
        parts.push(data.failureRealizationPoint);
        parts.push(""); // Add a blank line
    }
    // --- END ADD ---

    if (data.evidenceLink) {
      parts.push("## Evidence");
      parts.push(`![[${data.evidenceLink}]]`); // Embed image/link
      parts.push(""); // Add a blank line
    }

    if (data.linkedMockTest) {
      parts.push("## Linked Mock Test");
      parts.push(
        `This failure ${
          data.provenance?.origin === "scrying-pool" ? "might" : "was"
        } linked to ${data.linkedMockTest}.`
      );
      parts.push(""); // Add a blank line
    }

    parts.push("## Reflection");
    parts.push(
      `This failure was categorized as a ${data.failureType}. The root cause seems to be: ${
        data.rootCauseChain[0]
      }. The Ariadne's Thread principle to ${
        data.provenance?.origin === "scrying-pool" ? "mitigate" : "prevent"
      } this in the future is: ${data.ariadnesThread}.`
    );

    if (data.counterFactual) {
      parts.push(""); // Add a blank line
      parts.push("## Counter-Factual");
      parts.push(
        `A different action that could have ${
          data.provenance?.origin === "scrying-pool" ? "helped avoid" : "prevented"
        } this was: ${data.counterFactual}.`
      );
    }

    return parts.join("\n");
  }


  // --- REFINED: Method to tag the Crucible task list item (L51) ---
  /**
   * Attempts to tag the original Crucible task list item in settings.tasks.
   * This method appends the failure tag to the *end* of the task text, ensuring a standard format.
   * @param taskId - The unique ID of the task in plugin.settings.tasks.
   * @param failureTag - The specific failure tag to add (e.g., #failed-on-YYYYMMDD), generated at log creation time.
   */
  private async tagCrucibleTask(taskId: string, failureTag: string): Promise<void> {
    console.log(`[LossLogService] Attempting to tag Crucible task with ID: ${taskId} using tag: ${failureTag} (generated at log creation time) (L51)`);
    // Find the task in the plugin settings
    const taskIndex = this.plugin.settings.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        const task = this.plugin.settings.tasks[taskIndex];

        // --- SIMPLIFIED LOGIC: Append tag if not already present ---
        // This is a simpler check than the regex splitting used previously,
        // but sufficient for ensuring the tag is added once per log creation event.
        // The tag format #failed-on-YYYYMMDD is specific enough to avoid false positives.
        if (!task.text.includes(failureTag)) {
            // Ensure a space before the tag if the text doesn't end with one
            const separator = task.text.endsWith(' ') ? '' : ' ';
            task.text = `${task.text}${separator}${failureTag}`;
            console.log(`[LossLogService] Appended tag ${failureTag} to task ${taskId}. New text: "${task.text}" (L51).`);
            // Save the updated settings
            await this.plugin.saveSettings();
            console.log(`[LossLogService] Saved settings after tagging Crucible task ${taskId} (L51).`);
            // Potentially trigger a UI refresh if the task is displayed somewhere that should update immediately
            // e.g., this.plugin.rerenderMatrixView(); // If such a method exists
        } else {
            console.log(`[LossLogService] Tag ${failureTag} already exists in Crucible task ${taskId}. Skipping (L51).`);
        }
        // --- END SIMPLIFIED LOGIC ---
    } else {
        console.log(`[LossLogService] Could not find Crucible task with ID "${taskId}" to auto-tag (L51).`);
    }
  }
  // --- END REFINED ---

  // --- REFINED: Method to tag the original source file (L51, L77) ---
  /**
   * Attempts to tag the original source file associated with the failure.
   * This method reads the file, appends the failure tag to its content (or frontmatter),
   * and writes it back, fulfilling L51 for note-based origins.
   * It also adds the Kintsugi highlight tag/field (L77).
   * @param sourceIdentifier - The identifier for the original source. Expected to be a file path.
   * @param failureDate - The date of the failure, used in the tag.
   * @param failureTag - The specific tag to apply (e.g., #failed-on-YYYYMMDD).
   */
  private async autoTagOriginalTask(sourceIdentifier: string, failureDate: Date, failureTag: string): Promise<void> {
    // Assume sourceIdentifier is a file path for this implementation (fulfills L51 for note-linked tasks)
    const filePath = sourceIdentifier;
    // Note: failureDate is passed but the specific tag is now generated and passed as 'failureTag'

    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        // Read the current content of the file
        const content = await this.app.vault.read(file);

        let updatedContent = content;
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

        // Helper function to add a tag to a list field in frontmatter
        const addTagToFrontmatterList = (content: string, frontmatterMatch: RegExpMatchArray | null, fieldName: string, tag: string): string => {
            if (!frontmatterMatch) return content; // No frontmatter, can't add to list
            
            const currentFrontmatter = frontmatterMatch[1];
            const fieldMatch = currentFrontmatter.match(new RegExp(`^(${fieldName}:\\s*\\[([^\\]]*)\\])`, "m"));
            
            if (fieldMatch) {
                const existingItems = fieldMatch[2].trim();
                const itemsArray = existingItems ? existingItems.split(',').map(s => s.trim().replace(/"/g, '')).filter(s => s) : [];
                if (!itemsArray.includes(tag)) {
                    itemsArray.push(tag);
                    const newList = itemsArray.map(item => `"${item}"`).join(', ');
                    return content.replace(fieldMatch[0], `${fieldName}: [${newList}]`);
                }
            } else {
                // If field doesn't exist, add it
                const newFrontmatter = `${currentFrontmatter}\n${fieldName}: ["${tag}"]`;
                return content.replace(frontmatterMatch[0], `---\n${newFrontmatter}\n---\n`);
            }
            return content; // No changes needed
        };

        // --- Add main failure tag ---
        if (!content.includes(failureTag)) {
            updatedContent = addTagToFrontmatterList(updatedContent, frontmatterMatch, 'labyrinthFailures', failureTag.replace('#failed-on-', ''));
            if (updatedContent === content && !frontmatterMatch) {
                // No frontmatter, so append to body
                updatedContent = `${content}\n\n${failureTag}`;
            }
        } else {
            console.log(`[LossLogService] Tag ${failureTag} already exists in ${filePath}. Skipping (L51).`);
        }

        // --- NEW: Add Kintsugi Highlighting Tag/Field (L77) ---
        const kintsugiTag = "labyrinth/kintsugi-highlight"; // Storing without '#'
        if (!updatedContent.includes(kintsugiTag)) {
            updatedContent = addTagToFrontmatterList(updatedContent, frontmatterMatch, 'labyrinthStatus', kintsugiTag);
            if (updatedContent === content && !frontmatterMatch) {
                // No frontmatter, so append to body
                updatedContent = `${updatedContent}\n\n#${kintsugiTag}`;
            }
        } else {
            console.log(`[LossLogService] Kintsugi highlight tag ${kintsugiTag} already exists in ${filePath}. Skipping (L77).`);
        }
        // --- END NEW ---

        // Write the updated content back to the file if it has changed
        if (updatedContent !== content) {
            await this.app.vault.modify(file, updatedContent);
            console.log(`[LossLogService] Auto-tagged ${filePath} with ${failureTag} and ${kintsugiTag} (L51, L77).`);
        }

      } else {
        console.log(`[LossLogService] Could not find file ${filePath} to auto-tag (L51, L77).`);
      }
    } catch (e) {
      console.error(`[LossLogService] Error auto-tagging source ${sourceIdentifier} (L51, L77):`, e);
      // Optionally show a notice to the user
      // new Notice(`Failed to auto-tag source: ${e.message}`);
    }
  }
  // --- END REFINED ---

  // --- NEW: Method to handle weekly reset (L85, L98) ---
  /**
   * Handles the weekly reset event.
   * Clears the pending loss log queue and the loom deferral counts map.
   * Also clears the minotaur history if required by L98.
   */
  public handleWeeklyReset(): void {
    console.log("[LossLogService] Handling weekly reset...");

    // Clear the pending logs queue
    this.clearPendingLogs();

    // Clear the loom deferral counts map (L85)
    // This ensures counts don't accumulate indefinitely and start fresh each week
    this.plugin.settings.loomDeferralCounts = {};
    console.log("[LossLogService] Cleared loom deferral counts map (L85).");

    // Clear the minotaur history (L98)
    // This ensures the history reflects changes over recent weeks, not indefinitely.
    this.clearMinotaurHistory(); // Assuming this method exists and clears settings.minotaurHistory

    // Save the settings to persist the cleared data
    this.plugin.saveSettings().catch((e) =>
      console.error("[LossLogService] Error saving settings after weekly reset:", e)
    );

    console.log("[LossLogService] Weekly reset handled.");
  }
  // --- END NEW ---

  // --- REFINED: Asynchronously updates the Minotaur by reading recent loss log files. (L9) ---
  // This involves querying recent logs from the vault, analyzing them,
  // applying refined recency weighting (L81) using exponential decay,
  // and calculating the most frequent archetype based on weighted scores.
  // It also updates the minotaur history (L98).
  private async updateMinotaurAsync(): Promise<void> {
    const folderPath = normalizePath(this.settings.lossLogFolder);
    const now = new Date();

    // Find all .md files in the Labyrinth folder
    const allFiles = this.app.vault.getMarkdownFiles();
    const labyrinthFiles = allFiles.filter(file => file.path.startsWith(folderPath));

    // Read and parse frontmatter for *all* logs to calculate stats based on the last 30 days
    const recentLogs: LossLogData[] = [];
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    for (const file of labyrinthFiles) {
      try {
        const fileContent = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache && cache.frontmatter) {
          const timestamp = cache.frontmatter.timestamp as string;
          if (timestamp) {
            const logDate = new Date(timestamp);
            // Check if the log is within the last 30 days
            if (logDate >= thirtyDaysAgo) {
              // Create a basic LossLogData object from frontmatter (as done elsewhere)
              // Note: This is a simplified reconstruction; full data might require parsing body or more complex frontmatter handling
              const logData: LossLogData = {
                lossId: cache.frontmatter.lossId as string,
                sourceTask: cache.frontmatter.sourceTask as string,
                failureType: cache.frontmatter.failureType as FailureType,
                failureArchetypes: (cache.frontmatter.failureArchetypes as string[]) || [],
                impact: cache.frontmatter.impact as number || 1,
                syllabusTopics: (cache.frontmatter.syllabusTopics as string[]) || [],
                syllabusPapers: (cache.frontmatter.syllabusPapers as string[]) || [],
                aura: cache.frontmatter.aura as string || "#aura-mid",
                emotionalState: cache.frontmatter.emotionalState as string,
                rootCauseChain: (cache.frontmatter.rootCauseChain as string[]) || [],
                ariadnesThread: cache.frontmatter.ariadnesThread as string || "",
                counterFactual: cache.frontmatter.counterFactual as string,
                evidenceLink: cache.frontmatter.evidenceLink as string,
                linkedMockTest: cache.frontmatter.linkedMockTest as string,
                timestamp: timestamp,
                provenance: cache.frontmatter.provenance as any // Or define a more specific type
              };
              recentLogs.push(logData);
            }
          }
        }
      } catch (e) {
        console.error(`[LossLogService] Error reading/parsing file ${file.path}:`, e);
      }
    }

    // --- NEW: Calculate archetype frequencies with Exponential Decay Weighting (L81) ---
    // Use a decay factor. For example, a factor of 0.95 means influence decreases by ~5% per day.
    // Influence(t) = base_influence * (decay_factor) ^ t, where t is days since log creation.
    const archetypeWeightedScores: Record<string, number> = {};
    const decayFactorPerDay = this.settings.labyrinthDecayFactor || 0.95; // Use a configurable setting, defaulting to 0.95
    const baseWeight = 1.0; // Base influence of a log created today

    for (const log of recentLogs) {
      const logDate = new Date(log.timestamp);
      const millisecondsPerDay = 1000 * 60 * 60 * 24;
      const daysSinceLog = Math.floor((now.getTime() - logDate.getTime()) / millisecondsPerDay);

      // Calculate the weight using the decay formula
      const weight = baseWeight * Math.pow(decayFactorPerDay, daysSinceLog);

      for (const archetype of log.failureArchetypes) {
        if (!archetypeWeightedScores[archetype]) {
          archetypeWeightedScores[archetype] = 0;
        }
        // Add the calculated, exponentially decayed weight
        archetypeWeightedScores[archetype] += weight;
      }
    }
    // --- END NEW ---

    // Identify the top archetype based on weighted scores
    let newMinotaur = "";
    let maxWeightedScore = 0;
    for (const [archetype, score] of Object.entries(archetypeWeightedScores)) {
      if (score > maxWeightedScore) {
        maxWeightedScore = score;
        newMinotaur = archetype;
      }
    }

    // Update settings if the Minotaur has changed
    const oldMinotaur = this.settings.currentMinotaur;
    if (newMinotaur !== oldMinotaur) {
      // --- UPDATE MINOTAUR HISTORY (L98) ---
      // Add the *previous* minotaur to the history before updating the current one
      if (oldMinotaur) { // Only add if there was a previous minotaur
        // Use the date *of the change* (today) for the history entry
        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        this.settings.minotaurHistory.push({
          date: todayStr,
          archetype: oldMinotaur
        });
        // Optional: Limit history length to prevent it growing indefinitely
        // e.g., keep only the last 30 entries
        if (this.settings.minotaurHistory.length > 30) {
          this.settings.minotaurHistory = this.settings.minotaurHistory.slice(-30);
        }
      }
      // --- END UPDATE MINOTAUR HISTORY ---

      this.settings.currentMinotaur = newMinotaur;

      console.log(
        `[LossLogService] Minotaur updated from '${oldMinotaur}' to '${newMinotaur}' based on analysis of ${recentLogs.length} recent logs with exponential decay-weighted scoring (factor: ${decayFactorPerDay}). Max weighted score: ${maxWeightedScore.toFixed(2)}.`
      );

      // Potentially emit an event if other parts of the UI (like Mythos Hub) need to react
      this.eventBus.emit(EVENT_MINOTAUR_UPDATED, {
        oldMinotaur,
        newMinotaur: newMinotaur,
      });
    } else {
        console.log(`[LossLogService] Minotaur remains '${this.settings.currentMinotaur}'. No change based on exponential decay-weighted analysis.`);
    }
  }
  // --- END REFINED ---

  /**
   * Helper to ensure a folder exists, creating it if necessary.
   * @param folderPath - The path to the folder.
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    try {
      await this.app.vault.createFolder(folderPath);
      console.log(`[LossLogService] Created Labyrinth folder: ${folderPath}`);
    } catch (e) {
      // Ignore error if folder already exists
      if (e.message !== "Folder already exists") {
        console.error(`[LossLogService] Error creating folder ${folderPath}:`, e);
        throw e; // Re-throw to stop the process if folder creation is critical
      }
      // If folder already exists, that's fine, just continue.
    }
  }

  /**
   * Helper to generate a unique loss ID in the format 'loss_YYYYMMDD_HHMM'.
   * @returns A string ID.
   */
  private generateLossId(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, ""); // HHMM (e.g., 1423)
    return `loss_${dateStr}_${timeStr}`;
  }

  /**
   * Prepares the LossLogData object, filling in defaults, generating the unique ID,
   * and ensuring required fields are present.
   * This method would typically be called from the LossLogModal before passing to createLossLog.
   * @param input - Partial data provided by the user/modal.
   * @returns A complete LossLogData object ready for saving.
   */
  public prepareLossLogData(input: Partial<LossLogData>): LossLogData {
    const timestamp = new Date().toISOString();
    return {
      lossId: this.generateLossId(), // Generate unique ID
      sourceTask: input.sourceTask || "Unknown Task",
      failureType: (input.failureType || "Knowledge Gap") as FailureType, // Ensure correct type
      failureArchetypes: input.failureArchetypes || [], // Should come from modal
      impact: input.impact || 1, // Default impact
      syllabusTopics: input.syllabusTopics || [], // Should come from modal
      syllabusPapers: input.syllabusPapers || [], // Should come from modal
      aura: input.aura || "#aura-mid", // Default aura
      emotionalState: input.emotionalState,
      rootCauseChain: input.rootCauseChain || [], // Should come from modal
      ariadnesThread: input.ariadnesThread || "", // Should come from modal
      counterFactual: input.counterFactual,
      evidenceLink: input.evidenceLink,
      linkedMockTest: input.linkedMockTest,
      timestamp: timestamp,
      provenance: {
        origin: input.provenance?.origin || "manual",
        // Include sourceTaskId if provided in the input
        sourceTaskId: input.provenance?.sourceTaskId,
      },
    };
  }

  /**
   * Gets the current pending loss log context items.
   * @returns An array of PendingLossLogContext objects.
   */
  public getPendingLogs(): PendingLossLogContext[] {
    return this.settings.lossLogPending as PendingLossLogContext[]; // Cast to the new type
  }

  /**
   * Removes a specific pending log context item by its index.
   * @param index - The index of the pending log context item to remove.
   */
  public removePendingLog(index: number): void {
    const updatedPendingLogs = [...this.settings.lossLogPending];
    updatedPendingLogs.splice(index, 1);
    this.settings.lossLogPending = updatedPendingLogs as any[]; // Update settings, cast back if necessary depending on settings type
    // this.eventBus.emit('pendingLossLogsUpdated', updatedPendingLogs);
  }

  /**
   * Clears the minotaur history. Typically called on weekly reset (L98).
   */
  public clearMinotaurHistory(): void {
    this.settings.minotaurHistory = [];
    console.log("[LossLogService] Minotaur history cleared.");
    // Optionally emit an event if other parts of the UI need to react
    // this.eventBus.emit('minotaurHistoryCleared');
  }

  /**
   * Gets the minotaur history.
   * @returns An array of { date: string; archetype: string } objects.
   */
  public getMinotaurHistory(): { date: string; archetype: string }[] {
    return this.settings.minotaurHistory;
  }

  // --- NEW: Method for Escape Mechanic (L25) ---
  public showEscapeMechanicNotice(): void {
      new Notice("The thread is set. A path out has been mapped.", 5000); // Show for 5 seconds
  }
  // --- END NEW ---

}