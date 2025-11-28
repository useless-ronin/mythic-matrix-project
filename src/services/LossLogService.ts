// src/services/LossLogService.ts

import { App, Notice, normalizePath, TFile } from "obsidian";
import { EventBus } from "./EventBus";
import {
  LossLogData,
  MythicMatrixSettings,
  EVENT_LOSS_LOGGED,
  EVENT_MINOTAUR_UPDATED,
  EVENT_LABYRINTH_XP_UPDATED,
  EVENT_ACHIEVEMENT_UNLOCKED,
  FailureArchetype,
  FailureType,
} from "../constants";
import MythicMatrixPlugin from "../main";
import { RevisionScheduler } from "./RevisionScheduler";
import { THESEUS_DRILLS } from "../constants"; // Import the drills
import { Bounty } from '../constants'; // Import new interface
import { GROWTH_PROMPTS } from "../constants"; // Import quotes
import { XP_LEVELS } from "../constants";


// Note: Remote URLs might be blocked by Obsidian CSP in some contexts.
const RITUAL_SOUND_URL = 'https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3';

export interface PendingLossLogContext {
  sourceTask: string;
  initialFailureType?: FailureType;
  initialArchetypes?: string[];
  initialAura?: string;
  initialSyllabusTopics?: string[];
  originalTaskId?: string;
  timestamp: string;
  isProactive?: boolean;
  failureRealizationPoint?: string;
}

export class LossLogService {
  private app: App;
  private eventBus: EventBus;
  private settings: MythicMatrixSettings;
  private plugin: MythicMatrixPlugin;
  private revisionScheduler?: RevisionScheduler;

  constructor(app: App, eventBus: EventBus, settings: MythicMatrixSettings, plugin: MythicMatrixPlugin, revisionScheduler?: RevisionScheduler) {
    this.app = app;
    this.eventBus = eventBus;
    this.settings = settings;
    this.plugin = plugin;
    this.revisionScheduler = revisionScheduler;
  }

  public updateSettings(settings: MythicMatrixSettings): void {
    this.settings = settings;
  }

  // --- NEW: Public Getters for View Access ---
  public getLabyrinthXP(): number {
    return this.settings.labyrinthXP;
  }

  public getMinotaurStreak(): number {
    return this.settings.minotaurStreak;
  }
  // -----------------------------------------

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

  // --- NEW: Helper to expose Plugin instance safely ---
    public getPlugin(): MythicMatrixPlugin {
        return this.plugin;
    }

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
          const ariadnesThread = cache.frontmatter.ariadnesThread as string || "";
          const syllabusTopics = (cache.frontmatter.syllabusTopics as string[]) || [];
          const timestamp = cache.frontmatter.timestamp as string || new Date().toISOString();

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
                  const currentStoredInfo = topicThreadMap[topicPath].get(ariadnesThread);
                  if (!currentStoredInfo || new Date(timestamp) > new Date(currentStoredInfo.timestamp)) {
                    topicThreadMap[topicPath].set(ariadnesThread, { timestamp: timestamp, noteFile: file });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`[LossLogService] Error in obsolescence check:`, e);
      }
    }

    for (const [topicPath, threadInfoMap] of Object.entries(topicThreadMap)) {
      try {
        const topicFile = this.app.vault.getAbstractFileByPath(topicPath);
        if (topicFile instanceof TFile) {
          const topicCache = this.app.metadataCache.getFileCache(topicFile);
          if (topicCache && topicCache.frontmatter) {
            const myConfidence = topicCache.frontmatter.MyConfidence as number;
            if (myConfidence >= 4) {
              for (const [thread, threadInfo] of threadInfoMap.entries()) {
                const logDate = new Date(threadInfo.timestamp);
                if (logDate < thirtyDaysAgo) {
                  const originalLogNoteFile = threadInfo.noteFile;
                  const originalLogContent = await this.app.vault.read(originalLogNoteFile);
                  if (!originalLogContent.includes("#thread/archived")) {
                    let updatedContent = originalLogContent;
                    const frontmatterMatch = originalLogContent.match(/^---\n([\s\S]*?)\n---\n/);
                    if (frontmatterMatch) {
                      const currentFrontmatter = frontmatterMatch[1];
                      const statusFieldMatch = currentFrontmatter.match(/^(labyrinthStatus:\s*(.*))/m);
                      if (statusFieldMatch) {
                        const currentStatus = statusFieldMatch[2].trim();
                        if (!currentStatus.includes('archived')) {
                          const newStatus = currentStatus.endsWith(',') ? `${currentStatus} archived` : `${currentStatus}, archived`;
                          updatedContent = originalLogContent.replace(statusFieldMatch[0], `labyrinthStatus: ${newStatus}`);
                        }
                      } else {
                        const newFrontmatter = `${currentFrontmatter}\nlabyrinthStatus: archived`;
                        updatedContent = originalLogContent.replace(frontmatterMatch[0], `---\n${newFrontmatter}\n---\n`);
                      }
                    } else {
                      updatedContent = `${originalLogContent}\n\n#thread/archived`;
                    }
                    await this.app.vault.modify(originalLogNoteFile, updatedContent);
                    console.log(`[LossLogService] Archived thread in ${originalLogNoteFile.path} (L90).`);
                  }
                }
              }
            }
          }
        }
      } catch (e) { console.error(e); }
    }
  }

// --- NEW: Unified store (preferred) ---
public incrementTaskDeferralCount(taskId: string): number {
  if (!this.plugin.settings.taskDeferralCounts) {
    this.plugin.settings.taskDeferralCounts = {};
  }
  const current = this.plugin.settings.taskDeferralCounts[taskId] || 0;
  const newCount = current + 1;
  this.plugin.settings.taskDeferralCounts[taskId] = newCount;
  this.plugin.saveSettings();
  return newCount;
}

public getTaskDeferralCount(taskId: string): number {
  return this.plugin.settings.taskDeferralCounts?.[taskId] || 0;
}

public resetTaskDeferralCount(taskId: string): void {
  if (this.plugin.settings.taskDeferralCounts) {
    delete this.plugin.settings.taskDeferralCounts[taskId];
    this.plugin.saveSettings();
  }
}

// --- BACKWARD-COMPATIBLE BRIDGE: Old Loom methods (L32 legacy) ---
public incrementLoomDeferralCount(taskId: string): void {
  // Forward to new system, but ignore return value to match old signature
  this.incrementTaskDeferralCount(taskId);
}

public getLoomDeferralCount(taskId: string): number {
  return this.getTaskDeferralCount(taskId);
}

public resetLoomDeferralCount(taskId: string): void {
  // ⚠️ Old behavior: set to 0 instead of deleting
  if (!this.plugin.settings.taskDeferralCounts) {
    this.plugin.settings.taskDeferralCounts = {};
  }
  this.plugin.settings.taskDeferralCounts[taskId] = 0;
  this.plugin.saveSettings();
}

  // --- NEW: L23 Auto-Detect Linked Mock Test ---
    /**
     * Scans recent files to find a potential Mock Test note created in the last 24 hours.
     * Looks for filenames containing "Mock", "Test", or "GS".
     */
    public getRecentMockTest(): string | undefined {
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        
        // Filter files created in the last 24 hours
        const recentFiles = this.app.vault.getMarkdownFiles().filter(f => {
            return (now - f.stat.ctime) < oneDay;
        });

        // Sort by creation time (newest first)
        recentFiles.sort((a, b) => b.stat.ctime - a.stat.ctime);

        // Look for keywords
        const mockFile = recentFiles.find(f => {
            const name = f.basename.toLowerCase();
            return name.includes("mock") || name.includes("test") || name.match(/gs\d/);
        });

        return mockFile ? `[[${mockFile.basename}]]` : undefined;
    }

    // --- NEW: L18 Weaver's Loom Trigger ---
    /**
     * Checks if a failure indicates a need for synthesis.
     * Condition: Failure Type = "Knowledge Gap" AND 2+ Syllabus Topics involved.
     */
    public async checkForLoomOpportunity(lossData: LossLogData) {
        if (lossData.failureType === "Knowledge Gap" && lossData.syllabusTopics.length >= 2) {
            console.log("[LossLogService] Knowledge Gap across multiple topics detected. Triggering Weaver's Loom suggestion.");
            
            // Clean topic names
            const cleanTopics = lossData.syllabusTopics.map(t => t.replace(/\[\[|\]\]/g, ''));
            
            // Create a Tension Loom task (usually best for gaps between topics)
            const taskText = `Synthesize ${cleanTopics.map(t => `[[${t}]]`).join(', ')} (Loom Type: Tension) - Triggered by Labyrinth Failure`;
            
            // Add to Crucible
            this.plugin.settings.tasks.push({
                id: Date.now().toString(36),
                text: taskText,
                created: Date.now()
            });
            
            await this.plugin.saveSettings();
            
            new Notice("🕸️ Weaver's Loom Triggered: Synthesis task added to Crucible to bridge these topics.");
        }
    }

    // --- NEW: L83 Overconfidence Check ---
    /**
     * Checks if high confidence met high failure impact.
     * If so, adds a tag and notifies the user.
     */
    private checkOverconfidenceTrap(data: LossLogData, tags: string[]): void {
        if (data.confidenceScore && data.impact) {
            // Rule: Confidence >= 4 (High) AND Impact >= 4 (High Loss)
            if (data.confidenceScore >= 4 && data.impact >= 4) {
                console.log("[LossLogService] Overconfidence Trap Detected (L83).");
                tags.push("#failure/overconfidence"); // Auto-tag
                new Notice("⚠️ Overconfidence Trap Detected: You were sure, but you failed. Check your foundations.");
            }
        }
    }

  // --- UPDATED: Main Logic Entry Point ---
  public async createLossLog(lossData: LossLogData): Promise<string> {
    try {
      // 1. Existing File Creation Logic
      const notePath = await this.createLossLogNote(lossData);

      // 2. Gamification: XP & Minotaur (L30, L26)
      await this.processGamification(lossData);

      // 3. Actionability: VOI Trigger (L53)
      await this.checkVOITrigger(lossData);

      // 4. Ritual: Sound (L96)
      this.playRitualSound();

      // 6. Gamification: Bounty Check (L29)
      await this.checkBountyProgress(lossData);

      // 7. Consequences: Fog of War & Decay (L20, L55)
      await this.applyConsequencesToSources(lossData);

      // 8. Integration: Weaver (L18)
            if (this.checkForLoomOpportunity) { // Check if method exists
                 this.checkForLoomOpportunity(lossData);
            }

        await this.processGamification(lossData);
        await this.checkVOITrigger(lossData);
        this.playRitualSound();
        if (this.checkForLoomOpportunity) this.checkForLoomOpportunity(lossData);
        await this.applyConsequencesToSources(lossData);

        // --- NEW: L97 Automatic Enshrinement Check ---
        await this.checkThreadEnshrinement(lossData.ariadnesThread);

      return notePath;
    } catch (error) {
      console.error("Error creating loss log:", error);
      new Notice(`Failed to create loss log note.`);
      throw error;
    }
  }

   // --- NEW: L97 Logic ---
    private async checkThreadEnshrinement(thread: string) {
        if (!thread || thread.length < 5) return;

        // 1. Count occurrences of this thread in previous logs
        const folder = this.settings.lossLogFolder;
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder));
        
        let count = 0;
        let recentFile: TFile | null = null;

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const t = cache?.frontmatter?.ariadnesThread;
            // Fuzzy match or exact? Let's go with exact trimmed for now to be safe
            if (t && t.trim() === thread.trim()) {
                count++;
                recentFile = file;
            }
        }

        // Count is inclusive of the one just created (since we saved the file first)
        // Rule: If used 3 times.
        if (count === 3) {
            // Trigger Ceremony
            console.log(`[LossLogService] Thread used 3 times. Triggering Enshrinement.`);
            
            // We use a Notice + Command, or just do it? 
            // Better to ask. We can't pop a modal easily here without blocking.
            // Let's use a Notice with a button? Obsidian API doesn't support interactive notices natively easily.
            // We'll use the "Daedalus" approach: A persistent notice or just do it and notify.
            
            // Let's auto-enshrine but notify the user they have leveled up.
            if (recentFile) {
                await this.enshrineThread(recentFile); // Reuse existing method
                new Notice("✨ TRINITY ACHIEVED: Ariadne's Thread has been Enshrined in the Legacy Codex.");
            }
        }
    }

  // --- NEW: L12 Theseus Protocol (Generate Drills) ---
    public async activateTheseusProtocol(archetype: string) {
        console.log(`[LossLogService] Activating Theseus Protocol for Minotaur: ${archetype}`);
        
        const drills = THESEUS_DRILLS[archetype] || THESEUS_DRILLS['default'];
        
        // Pick 2 random drills to avoid overwhelming
        const selectedDrills = drills.sort(() => 0.5 - Math.random()).slice(0, 2);

        let addedCount = 0;
        selectedDrills.forEach(drillText => {
            // Check if drill already exists to avoid duplicates
            const exists = this.plugin.settings.tasks.some(t => t.text === drillText);
            if (!exists) {
                this.plugin.settings.tasks.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    text: drillText,
                    created: Date.now()
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            await this.plugin.saveSettings();
            new Notice(`⚔️ Theseus Protocol Initiated: ${addedCount} drills added to Crucible.`);
        } else {
            new Notice("Theseus Protocol: Drills already active.");
        }
    }

    // --- NEW: L69 Daily Intent (Random Thread) ---
    public async getDailyIntent(): Promise<string | null> {
        const folderPath = this.settings.lossLogFolder;
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folderPath));
        
        if (files.length === 0) return null;

        // Collect all threads
        const threads: string[] = [];
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const thread = cache?.frontmatter?.ariadnesThread;
            if (thread && typeof thread === 'string' && thread.length > 10) {
                threads.push(thread);
            }
        }

        if (threads.length === 0) return null;

        // Pick random
        const randomThread = threads[Math.floor(Math.random() * threads.length)];
        return randomThread;
    }

// --- NEW: Extracted File Creation Logic (Corrected) ---
  private async createLossLogNote(lossData: LossLogData): Promise<string> {
    const folderPath = normalizePath(this.settings.lossLogFolder);
    await this.ensureFolderExists(folderPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}.md`;
    const notePath = normalizePath(`${folderPath}/${fileName}`);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const failureTag = `#failed-on-${dateStr}`;

    // --- 1. Collect ALL Tags Dynamically ---
    const tagsToAdd: string[] = []; 

    // L82: Check for Decay Correlation (Faded Ink)
    if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
      for (const topicLink of lossData.syllabusTopics) {
        const match = topicLink.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const topicFile = this.app.vault.getFiles().find(f => f.basename === match[1]);
          if (topicFile) {
            const cache = this.app.metadataCache.getFileCache(topicFile);
            const decayRisk = cache?.frontmatter?.decay_risk as number;
            if (decayRisk && decayRisk > 3) {
              tagsToAdd.push("#failure/faded-ink");
              break; // Only tag once
            }
          }
        }
      }
    }

    // L15: Proactive (Future Risk)
    if (lossData.provenance?.origin === "scrying-pool") {
        tagsToAdd.push("#loss/future-risk");
    }

    // L83: Overconfidence Check (Call the helper)
    this.checkOverconfidenceTrap(lossData, tagsToAdd);

    // L42: Exam Phase Tagging
    if (lossData.examPhase) {
        tagsToAdd.push(`#${lossData.examPhase.toLowerCase()}`);
    }

    // L43: Question Type Tagging
    if (lossData.questionType) {
        // Convert "Critically Examine" -> "#archetype-critically-examine"
        const safeType = lossData.questionType.toLowerCase().replace(/[\s/]/g, '-');
        tagsToAdd.push(`#archetype-${safeType}`);
    }

    // --- 2. Generate Content ---
    const frontmatterYaml = this.generateFrontmatterYaml(lossData, failureTag);
    
    // Generate base body
    let bodyContent = this.generateBodyContent(lossData, failureTag);

    // Append all collected tags to body content
    if (tagsToAdd.length > 0) {
        bodyContent += `\n\n${tagsToAdd.join(" ")}`;
    }

        // --- NEW: Append Interactive Controls Block ---
    bodyContent += `\n\n\`\`\`labyrinth-controls\n\`\`\``;

    const noteContent = `---\n${frontmatterYaml}---\n\n${bodyContent}`;
    
    // --- 3. Create File ---
    const file = await this.app.vault.create(notePath, noteContent);

    // --- 4. Post-Creation Logic (Side Effects) ---

    // L51, L24: Auto-Tagging Original Sources
    if (lossData.provenance?.sourceTaskId) {
      const sourceTaskId = lossData.provenance.sourceTaskId;
      if (this.isFilePath(sourceTaskId)) {
        await this.autoTagOriginalTask(sourceTaskId, new Date(), failureTag);
      } else {
        await this.tagCrucibleTask(sourceTaskId, failureTag);
      }
    }

    // L24: Blocked Task Logic
    if (lossData.sourceTask.includes("#blocked")) {
      let updatedNoteContent = noteContent;
      if (!noteContent.includes("#failure/dependency-blocked")) {
        updatedNoteContent += "\n\n#failure/dependency-blocked";
        await this.app.vault.modify(file, updatedNoteContent);
      }
      const noteLinkMatch = lossData.sourceTask.match(/\[\[([^\]]+)\]\]/);
      if (noteLinkMatch) {
        const sourceNoteFile = this.app.vault.getFiles().find(f => f.basename === noteLinkMatch[1]);
        if (sourceNoteFile) {
          await this.autoTagOriginalTask(sourceNoteFile.path, new Date(), "#failure/dependency-blocked");
        }
      }
    }

    // L85: Reset Loom Deferral Count if applicable
    const origin = lossData.provenance?.origin;
    const sourceTaskId = lossData.provenance?.sourceTaskId;
    if (sourceTaskId && (origin === "manual" || origin === "quick-log" || origin === "scrying-pool-quick")) {
      if (!this.isFilePath(sourceTaskId)) {
        this.resetLoomDeferralCount(sourceTaskId);
      }
    }

    // L55: Digital Garden Update
    if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
      for (const topicLink of lossData.syllabusTopics) {
        const match = topicLink.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const topicFile = this.app.vault.getFiles().find(f => f.basename === match[1]);
          if (topicFile) {
            const content = await this.app.vault.read(topicFile);
            const cache = this.app.metadataCache.getFileCache(topicFile);
            const currentStatus = cache?.frontmatter?.gardenStatus as string;
            if (currentStatus) {
              let newStatus = currentStatus;
              if (currentStatus.includes("🌳")) newStatus = currentStatus.replace("🌳", "🍂");
              else if (currentStatus.includes("🍂")) newStatus = currentStatus.replace("🍂", "🍁");
              if (newStatus !== currentStatus) {
                const updatedTopicContent = content.replace(/^(gardenStatus:\s*)(.*)$/m, `$1${newStatus}`);
                await this.app.vault.modify(topicFile, updatedTopicContent);
              }
            }
          }
        }
      }
    }

    // L52: Emergency Revision
    if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0 && this.revisionScheduler) {
      for (const topicLink of lossData.syllabusTopics) {
        const match = topicLink.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const topicFile = this.app.vault.getFiles().find(f => f.basename === match[1]);
          if (topicFile) {
            await this.revisionScheduler.scheduleEmergencyRevision(topicFile.path, 1);
          }
        }
      }
    }

    // 5. System Integration: Weaver Trigger (L18)
    // Ensure this method exists in your class from previous steps
    if (this.checkForLoomOpportunity) {
        this.checkForLoomOpportunity(lossData);
    }

    this.eventBus.emit(EVENT_LOSS_LOGGED, { log: lossData, notePath: file.path });
    this.updateMinotaurAsync();
    new Notice(`Labyrinth: ${lossData.provenance?.origin === "scrying-pool" ? "Risk" : "Failure"} logged.`);
    return file.path;
  }

  private isFilePath(identifier: string): boolean {
    return identifier.includes('/') || identifier.includes('.');
  }

  public addPendingLog(pendingContext: PendingLossLogContext): void {
    const updatedPendingLogs = [...this.settings.lossLogPending, pendingContext];
    this.settings.lossLogPending = updatedPendingLogs;
    new Notice("Labyrinth: Failure logged for later reflection.");
  }

  // --- NEW: Gamification Logic (L26, L30) ---
  private async processGamification(data: LossLogData) {
    // A. Award XP (L30)
    const xpGain = 10;
    this.plugin.settings.labyrinthXP += xpGain; // Modify plugin.settings directly for safety
    this.eventBus.emit(EVENT_LABYRINTH_XP_UPDATED, { total: this.plugin.settings.labyrinthXP, gained: xpGain });
    new Notice(`+${xpGain} XP: Wisdom extracted.`);

    // B. Minotaur Slaying Logic (L26)
    const currentMinotaur = this.plugin.settings.currentMinotaur;
    const today = new Date().toISOString().split('T')[0];

    // --- NEW: L56 Phoenix Counter ---
        if (!this.plugin.settings.totalLossesLogged) {
            this.plugin.settings.totalLossesLogged = 0;
        }
        this.plugin.settings.totalLossesLogged++;

    if (currentMinotaur && data.failureArchetypes.includes(currentMinotaur)) {
      this.plugin.settings.minotaurStreak = 0;
      this.plugin.settings.lastMinotaurDate = today;
      new Notice(`The Minotaur (${currentMinotaur}) struck again. Streak reset.`);
    } else {
      if (this.plugin.settings.lastMinotaurDate) {
        const lastDate = new Date(this.plugin.settings.lastMinotaurDate);
        const nowDate = new Date();
        const diffTime = Math.abs(nowDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        this.plugin.settings.minotaurStreak = diffDays;

        if (diffDays >= 21) {
          new Notice(`🏆 ACHIEVEMENT: MINOTAUR SLAIN! 21 Days free of ${currentMinotaur}.`);
          this.eventBus.emit(EVENT_ACHIEVEMENT_UNLOCKED, { name: "Minotaur Slayer" });
        }
      }
    }
    await this.plugin.saveSettings();
  }

  // --- NEW: VOI Trigger (L53) ---
  private async checkVOITrigger(data: LossLogData) {
    if (data.failureArchetypes.includes("source-deficit") || data.failureArchetypes.includes("credibility-gap")) {
      const tasksToAdd: string[] = [];
      if (data.syllabusTopics && data.syllabusTopics.length > 0) {
        data.syllabusTopics.forEach(topicLink => {
          const topicName = topicLink.replace(/\[\[|\]\]/g, '');
          tasksToAdd.push(`🔍 VOI Review: Re-evaluate source credibility for [[${topicName}]] (Triggered by Labyrinth)`);
        });
      } else {
        tasksToAdd.push(`🔍 VOI Review: Audit sources for recent failure on "${data.sourceTask}"`);
      }

      tasksToAdd.forEach(text => {
        this.plugin.settings.tasks.push({
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          text: text,
          created: Date.now()
        });
      });

      await this.plugin.saveSettings();
      new Notice("⚠️ Source Deficit: VOI Review tasks created in Crucible.");
    }
  }

  // --- NEW: Sound Ritual (L96) ---
  private playRitualSound() {
    if (!this.plugin.settings.enableLabyrinthSound) return;
    try {
      const audio = new Audio(RITUAL_SOUND_URL);
      audio.volume = 0.5;
      audio.play().catch(e => console.error("Audio play failed:", e));
    } catch (e) {
      console.error("Failed to play ritual sound", e);
    }
  }

  // --- NEW: L97 Enshrinement Logic ---
    public async enshrineThread(file: TFile) {
        const cache = this.app.metadataCache.getFileCache(file);
        const thread = cache?.frontmatter?.ariadnesThread;
        const topics = cache?.frontmatter?.syllabusTopics || [];

        if (!thread) {
            new Notice("No Ariadne's Thread found to enshrine.");
            return;
        }

        // 1. Define Codex Path (Could be a setting, defaulting to root for now)
        const codexPath = "Legacy Codex.md"; 
        let codexFile = this.app.vault.getAbstractFileByPath(codexPath);

        // 2. Create Codex if missing
        if (!codexFile) {
            await this.app.vault.create(codexPath, "# 📜 The Legacy Codex\n*Principles forged in the Labyrinth.*\n\n");
            codexFile = this.app.vault.getAbstractFileByPath(codexPath);
        }

        if (codexFile instanceof TFile) {
            // 3. Format the Entry
            const date = new Date().toISOString().split('T')[0];
            const topicTags = topics.join(" ");
            const entry = `\n- [ ] **${thread}**\n    - *Forged: ${date}* | Source: [[${file.basename}]] | Context: ${topicTags}\n`;

            // 4. Append
            await this.app.vault.append(codexFile, entry);
            
            new Notice("✨ Principle Enshrined in Legacy Codex.");
            
            // Optional: Mark the original file as enshrined
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                fm.enshrined = true;
            });
        }
    }
    // ... 

// --- NEW: L57 Get Random Growth Prompt ---
    public getRandomGrowthPrompt(): string {
        return GROWTH_PROMPTS[Math.floor(Math.random() * GROWTH_PROMPTS.length)];
    }

    // --- NEW: L49 Escape Rate Metric ---
    /**
     * Calculates the percentage of topics that were logged as failures
     * but later appeared in Alchemist Logs with high understanding.
     */
    public async calculateEscapeRate(): Promise<{ rate: number, escaped: number, total: number }> {
        const lossFolder = this.settings.lossLogFolder;
        const alchemistFolder = this.settings.alchemistLogFolder; // Ensure this is in settings interface
        
        // 1. Get all Loss Logs
        const lossFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(lossFolder));
        
        // 2. Extract unique failed topics
        const failedTopics = new Set<string>();
        lossFiles.forEach(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            const topics = cache?.frontmatter?.syllabusTopics || [];
            topics.forEach((t: string) => failedTopics.add(t));
        });

        if (failedTopics.size === 0) return { rate: 0, escaped: 0, total: 0 };

        // 3. Check Alchemist Logs for "Escapes"
        // An escape is defined as: A log for a failed topic with "High" (🔼) understanding
        const alchemistFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(alchemistFolder));
        let escapedCount = 0;

        // Iterate through failed topics to see if they were redeemed
        for (const topic of failedTopics) {
            // Normalize topic string (remove [[ ]])
            const cleanTopic = topic.replace(/\[\[|\]\]/g, '');
            
            // Find if this topic exists in Alchemist logs with success
            const hasEscaped = alchemistFiles.some(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                const fm = cache?.frontmatter;
                const isMatch = f.basename.includes(cleanTopic) || (fm?.topic && fm.topic.includes(cleanTopic));
                const isSuccess = fm?.understanding === "🔼" || fm?.confidenceAfter === "🔼"; // High understanding/confidence
                
                return isMatch && isSuccess;
            });

            if (hasEscaped) escapedCount++;
        }

        return {
            rate: Math.round((escapedCount / failedTopics.size) * 100),
            escaped: escapedCount,
            total: failedTopics.size
        };
    }

    // --- NEW: L47 Thread Reuse Tracker ---
    /**
     * Identifies "Legendary Threads" - principles you use repeatedly.
     */
    public getThreadUsageStats(): { topThreads: [string, number][], totalThreads: number } {
        const folder = this.settings.lossLogFolder;
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder));
        
        const threadCounts: Record<string, number> = {};
        let total = 0;

        files.forEach(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            const thread = cache?.frontmatter?.ariadnesThread;
            if (thread) {
                // Simple normalization
                const cleanThread = thread.trim();
                threadCounts[cleanThread] = (threadCounts[cleanThread] || 0) + 1;
                total++;
            }
        });

        // Sort by frequency
        const sorted = Object.entries(threadCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5); // Top 5

        return { topThreads: sorted, totalThreads: total };
    }

    // --- NEW: L88 Failure-to-Insight Ratio ---
    public getInsightRatio(): string {
        const lossCount = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(this.settings.lossLogFolder)).length;
        const insightCount = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(this.settings.alchemistLogFolder)).length;

        if (insightCount === 0) return "Inf (Start reflecting!)";
        
        // Ratio: How many failures per 1 insight? 
        // Ideally, we want more insights than failures (Ratio < 1), 
        // or at least 1 insight for every failure.
        const ratio = (lossCount / insightCount).toFixed(1);
        return `1:${ratio}`; // 1 Insight per X Failures (Wait, logical display is Failures per Insight)
        // Let's display: "Failures per Insight: X"
    }

  // --- NEW: Convert Note to Guardian Task (L19) ---
  public async createGuardianTaskFromActiveNote(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const thread = cache?.frontmatter?.ariadnesThread;

    if (!thread) {
      new Notice("No Ariadne's Thread found in this note.");
      return;
    }

    const taskText = `🛡️ Guardian: "${thread}" (from [[${file.basename}]])`;
    this.plugin.settings.tasks.push({
      id: Date.now().toString(36),
      text: taskText,
      created: Date.now()
    });
    await this.plugin.saveSettings();
    new Notice("Guardian Task created in Crucible.");
  }

  // --- NEW: Apply Consequences to Source Notes (L20, L55) ---
    public async applyConsequencesToSources(lossData: LossLogData) {
        // Only apply if it's a Knowledge Gap or Skill Gap (Process failures usually aren't the note's fault)
        if (lossData.failureType === "Process Failure") return;

        const topics = lossData.syllabusTopics || [];
        
        for (const topicLink of topics) {
            // Clean [[Topic Name]] -> Topic Name
            const topicName = topicLink.replace(/\[\[|\]\]/g, '');
            const file = this.app.metadataCache.getFirstLinkpathDest(topicName, "");
            
            if (file instanceof TFile) {
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    // L20: Fog of War (Mark as Unstable)
                    const tags = fm.tags || [];
                    // Ensure we handle tags whether they are string or array
                    const currentTags = typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()) : tags;
                    
                    if (!currentTags.includes("labyrinth/unstable")) {
                        if (Array.isArray(fm.tags)) {
                            fm.tags.push("labyrinth/unstable");
                        } else if (typeof fm.tags === 'string') {
                            fm.tags = fm.tags ? [fm.tags, "labyrinth/unstable"] : ["labyrinth/unstable"];
                        } else {
                            fm.tags = ["labyrinth/unstable"];
                        }
                        console.log(`[LossLogService] L20: Marked ${file.basename} as unstable.`);
                    }

                    // L55: Digital Garden Decay
                    // Logic: Evergreen -> Wilted -> Seedling
                    if (fm.status) {
                        if (fm.status.includes("Evergreen") || fm.status.includes("🌳")) {
                            fm.status = "🍂 Wilted";
                            new Notice(`🍂 Garden Decay: '${file.basename}' downgraded to Wilted.`);
                        } else if (fm.status.includes("Wilted") || fm.status.includes("🍂")) {
                            fm.status = "🌱 Seedling";
                            new Notice(`🌱 Garden Decay: '${file.basename}' downgraded to Seedling.`);
                        }
                    }
                });
            }
        }
    }

// --- NEW: Get Nemesis Topics (L95/L70) ---
    /**
     * Returns a list of topics that have a high failure count (>= 3).
     * Used for L95 (Revision Blocking) and L70 (Interleaving).
     */
    public getNemesisTopics(): string[] {
        const folder = this.settings.lossLogFolder;
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder));
        const topicCounts: Record<string, number> = {};

        files.forEach(f => {
            const cache = this.app.metadataCache.getFileCache(f);
            const topics = cache?.frontmatter?.syllabusTopics || [];
            topics.forEach((t: string) => {
                const clean = t.replace(/\[\[|\]\]/g, '');
                topicCounts[clean] = (topicCounts[clean] || 0) + 1;
            });
        });

        // Filter for >= 3 failures
        return Object.entries(topicCounts)
            .filter(([_, count]) => count >= 3)
            .map(([topic]) => topic);
    }

    // --- NEW: Get Thread for Topic (L87) ---
    /**
     * Retrieves the most recent Ariadne's Thread for a specific topic.
     * Used to prompt the user upon task completion.
     */
    public getThreadForTopic(topicName: string): string | null {
        const folder = this.settings.lossLogFolder;
        // Get logs, sort by newest
        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(folder))
            .sort((a, b) => b.stat.ctime - a.stat.ctime);

        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const topics = cache?.frontmatter?.syllabusTopics || [];
            const thread = cache?.frontmatter?.ariadnesThread;

            // Check if this log relates to the topic and has a thread
            if (thread && topics.some((t: string) => t.includes(topicName))) {
                return thread;
            }
        }
        return null;
    }

    // --- NEW: L70 Interleaving Logic ---
    /**
     * Generates a study block mixing strong topics with one Nemesis topic.
     */
    public async generateInterleavedBlock() {
        const nemesisTopics = this.getNemesisTopics();
        
        if (nemesisTopics.length === 0) {
            new Notice("No Nemesis topics found! You are doing great.");
            return;
        }

        // Pick 1 random Nemesis
        const nemesis = nemesisTopics[Math.floor(Math.random() * nemesisTopics.length)];

        // Generate Tasks
        // Ideally, we pick 2 "Strong" topics, but for MVP we'll create generic placeholders
        // or pick random notes from the vault that AREN'T nemesis.
        const tasks = [
            `📚 Review: [[${nemesis}]] (⚠️ Nemesis Topic)`,
            `🧠 Practice: Mixed Recall (Strong Topic 1)`,
            `🧠 Practice: Mixed Recall (Strong Topic 2)`
        ];

        let count = 0;
        tasks.forEach(t => {
            this.plugin.settings.tasks.push({
                id: Date.now().toString() + count,
                text: t,
                created: Date.now()
            });
            count++;
        });

        await this.plugin.saveSettings();
        new Notice(`⚔️ Interleaved Block Generated: Focusing on ${nemesis}`);
    }    

  public clearPendingLogs(): void {
    this.settings.lossLogPending = [];
  }

  private generateFrontmatterYaml(data: LossLogData, failureTag: string): string {
    const lines = [
      `lossId: "${data.lossId}"`,
      `sourceTask: "${data.sourceTask.replace(/"/g, '\\"')}"`,
      `failureType: "${data.failureType}"`,
      `failureArchetypes: [${data.failureArchetypes.map((a) => `"${a}"`).join(", ")}]`,
      `impact: ${data.impact}`,
      `syllabusTopics: [${data.syllabusTopics.map((t) => `"${t}"`).join(", ")}]`,
      `syllabusPapers: [${data.syllabusPapers.map((p) => `"${p}"`).join(", ")}]`,
      `aura: "${data.aura}"`,
      ...(data.emotionalState ? [`emotionalState: "${data.emotionalState}"`] : []),
      `rootCauseChain: [${data.rootCauseChain.map((c) => `"${c.replace(/"/g, '\\"')}"`).join(", ")}]`,
      `ariadnesThread: "${data.ariadnesThread.replace(/"/g, '\\"')}"`,
      ...(data.counterFactual ? [`counterFactual: "${data.counterFactual.replace(/"/g, '\\"')}"`] : []),
      ...(data.evidenceLink ? [`evidenceLink: "${data.evidenceLink}"`] : []),
      ...(data.linkedMockTest ? [`linkedMockTest: "${data.linkedMockTest}"`] : []),
      ...(data.failureRealizationPoint ? [`failureRealizationPoint: "${data.failureRealizationPoint}"`] : []),
      `timestamp: "${data.timestamp}"`,
      `provenance:`,
      `  origin: "${data.provenance?.origin || "manual"}"`,
      ...(data.provenance?.sourceTaskId ? [`  sourceTaskId: "${data.provenance.sourceTaskId}"`] : []),
      `failureTags: ["${failureTag}"]`,
      ...(data.provenance?.origin === "scrying-pool" ? [`  isFutureRisk: true`] : []),
     ...(data.confidenceScore ? [`confidenceScore: ${data.confidenceScore}`] : []), // L41
      ...(data.questionType ? [`questionType: "${data.questionType}"`] : []),       // L43
      ...(data.sourceType ? [`sourceType: "${data.sourceType}"`] : []),             // L44
      ...(data.examPhase ? [`examPhase: "${data.examPhase}"`] : []),                // L42
    ];
    return lines.join("\n") + "\n";
  }

  private generateBodyContent(data: LossLogData, failureTag: string): string {
    const parts = [];
    parts.push(failureTag);
    parts.push("");
    parts.push("## Log");
    parts.push(`During ${data.syllabusPapers.join(", ")}, ${data.sourceTask} ${data.provenance?.origin === "scrying-pool" ? "is anticipated to result in" : "resulted in"} a failure.`);
    parts.push("");

    if (data.failureRealizationPoint) {
      parts.push("## Failure Realization Point");
      parts.push(data.failureRealizationPoint);
      parts.push("");
    }

    if (data.evidenceLink) {
      parts.push("## Evidence");
      parts.push(`![[${data.evidenceLink}]]`);
      parts.push("");
    }

    if (data.linkedMockTest) {
      parts.push("## Linked Mock Test");
      parts.push(`This failure ${data.provenance?.origin === "scrying-pool" ? "might" : "was"} linked to ${data.linkedMockTest}.`);
      parts.push("");
    }

    parts.push("## Reflection");
    parts.push(`This failure was categorized as a ${data.failureType}. The root cause seems to be: ${data.rootCauseChain[0]}. The Ariadne's Thread principle to ${data.provenance?.origin === "scrying-pool" ? "mitigate" : "prevent"} this in the future is: ${data.ariadnesThread}.`);

    if (data.counterFactual) {
      parts.push("");
      parts.push("## Counter-Factual");
      parts.push(`A different action that could have ${data.provenance?.origin === "scrying-pool" ? "helped avoid" : "prevented"} this was: ${data.counterFactual}.`);
    }

    return parts.join("\n");
  }

  private async tagCrucibleTask(taskId: string, failureTag: string): Promise<void> {
    const taskIndex = this.plugin.settings.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      const task = this.plugin.settings.tasks[taskIndex];
      if (!task.text.includes(failureTag)) {
        const separator = task.text.endsWith(' ') ? '' : ' ';
        task.text = `${task.text}${separator}${failureTag}`;
        await this.plugin.saveSettings();
      }
    }
  }

  private async autoTagOriginalTask(sourceIdentifier: string, failureDate: Date, failureTag: string): Promise<void> {
    const filePath = sourceIdentifier;
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        let updatedContent = content;
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

        const addTagToFrontmatterList = (content: string, frontmatterMatch: RegExpMatchArray | null, fieldName: string, tag: string): string => {
          if (!frontmatterMatch) return content;
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
            const newFrontmatter = `${currentFrontmatter}\n${fieldName}: ["${tag}"]`;
            return content.replace(frontmatterMatch[0], `---\n${newFrontmatter}\n---\n`);
          }
          return content;
        };

        if (!content.includes(failureTag)) {
          updatedContent = addTagToFrontmatterList(updatedContent, frontmatterMatch, 'labyrinthFailures', failureTag.replace('#failed-on-', ''));
          if (updatedContent === content && !frontmatterMatch) updatedContent = `${content}\n\n${failureTag}`;
        }

        const kintsugiTag = "labyrinth/kintsugi-highlight";
        if (!updatedContent.includes(kintsugiTag)) {
          updatedContent = addTagToFrontmatterList(updatedContent, frontmatterMatch, 'labyrinthStatus', kintsugiTag);
          if (updatedContent === content && !frontmatterMatch) updatedContent = `${updatedContent}\n\n#${kintsugiTag}`;
        }

        if (updatedContent !== content) {
          await this.app.vault.modify(file, updatedContent);
        }
      }
    } catch (e) { console.error(e); }
  }

  public handleWeeklyReset(): void {
    this.clearPendingLogs();
    this.plugin.settings.loomDeferralCounts = {};
    this.clearMinotaurHistory();
    this.plugin.saveSettings().catch((e) => console.error(e));
  }

  private async updateMinotaurAsync(): Promise<void> {
    const folderPath = normalizePath(this.settings.lossLogFolder);
    const now = new Date();
    const allFiles = this.app.vault.getMarkdownFiles();
    const labyrinthFiles = allFiles.filter(file => file.path.startsWith(folderPath));
    const recentLogs: LossLogData[] = [];
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    for (const file of labyrinthFiles) {
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache && cache.frontmatter) {
          const timestamp = cache.frontmatter.timestamp as string;
          if (timestamp) {
            const logDate = new Date(timestamp);
            if (logDate >= thirtyDaysAgo) {
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
                provenance: cache.frontmatter.provenance as any
              };
              recentLogs.push(logData);
            }
          }
        }
      } catch (e) { console.error(e); }
    }

    const archetypeWeightedScores: Record<string, number> = {};
    const decayFactorPerDay = this.settings.labyrinthDecayFactor || 0.95;
    const baseWeight = 1.0;

    for (const log of recentLogs) {
      const logDate = new Date(log.timestamp);
      const daysSinceLog = Math.floor((now.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24));
      const weight = baseWeight * Math.pow(decayFactorPerDay, daysSinceLog);
      for (const archetype of log.failureArchetypes) {
        if (!archetypeWeightedScores[archetype]) archetypeWeightedScores[archetype] = 0;
        archetypeWeightedScores[archetype] += weight;
      }
    }

    let newMinotaur = "";
    let maxWeightedScore = 0;
    for (const [archetype, score] of Object.entries(archetypeWeightedScores)) {
      if (score > maxWeightedScore) {
        maxWeightedScore = score;
        newMinotaur = archetype;
      }
    }

    const oldMinotaur = this.settings.currentMinotaur;
    if (newMinotaur !== oldMinotaur) {
      if (oldMinotaur) {
        const todayStr = new Date().toISOString().split('T')[0];
        this.settings.minotaurHistory.push({ date: todayStr, archetype: oldMinotaur });
        if (this.settings.minotaurHistory.length > 30) this.settings.minotaurHistory = this.settings.minotaurHistory.slice(-30);
      }
      this.settings.currentMinotaur = newMinotaur;
       this.activateTheseusProtocol(newMinotaur); 
      this.eventBus.emit(EVENT_MINOTAUR_UPDATED, { oldMinotaur, newMinotaur: newMinotaur });
      // -> ADD THIS LINE:

    }
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    try {
      await this.app.vault.createFolder(folderPath);
    } catch (e) {
      if (e.message !== "Folder already exists") console.error(e);
    }
  }

  private generateLossId(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, "");
    return `loss_${dateStr}_${timeStr}`;
  }

  public prepareLossLogData(input: Partial<LossLogData>): LossLogData {
    const timestamp = new Date().toISOString();
    return {
      lossId: this.generateLossId(),
      sourceTask: input.sourceTask || "Unknown Task",
      failureType: (input.failureType || "Knowledge Gap") as FailureType,
      failureArchetypes: input.failureArchetypes || [],
      impact: input.impact || 1,
      syllabusTopics: input.syllabusTopics || [],
      syllabusPapers: input.syllabusPapers || [],
      aura: input.aura || "#aura-mid",
      emotionalState: input.emotionalState,
      rootCauseChain: input.rootCauseChain || [],
      ariadnesThread: input.ariadnesThread || "",
      counterFactual: input.counterFactual,
      evidenceLink: input.evidenceLink,
      linkedMockTest: input.linkedMockTest,
      timestamp: timestamp,
      provenance: {
        origin: input.provenance?.origin || "manual",
        sourceTaskId: input.provenance?.sourceTaskId,
      },
      // New Defaults
            confidenceScore: input.confidenceScore,
            questionType: input.questionType,
            sourceType: input.sourceType,
            examPhase: input.examPhase || "Mains", // Default to Mains if not set? Or undefined.
    } as LossLogData; // Type assertion might be needed if strict
  }

  // --- NEW: L29 Failure Bounties Logic ---

    /**
     * Generates a new bounty for the week.
     * Typically called during Weekly Reset.
     */
    public async generateWeeklyBounty() {
        const archetypes = this.getFailureArchetypes();
        const randomArchetype = archetypes[Math.floor(Math.random() * archetypes.length)];
        
        // Create a "Wanted" mission
        const newBounty: Bounty = {
            id: Date.now().toString(),
            archetype: randomArchetype,
            count: 0,
            target: 3, // Standard goal: Catch this failure 3 times
            rewardXP: 50,
            completed: false
        };

        this.plugin.settings.activeBounty = newBounty;
        await this.plugin.saveSettings();
        console.log(`[LossLogService] New Bounty Generated: Catch ${randomArchetype}`);
    }

    /**
     * Checks if the newly logged failure contributes to the active bounty.
     */
    private async checkBountyProgress(data: LossLogData) {
        const bounty = this.plugin.settings.activeBounty;
        
        // Only process if bounty exists, isn't completed, and matches the logged archetype
        if (bounty && !bounty.completed && data.failureArchetypes.includes(bounty.archetype)) {
            bounty.count++;
            
            if (bounty.count >= bounty.target) {
                // Bounty Complete!
                bounty.completed = true;
                this.plugin.settings.labyrinthXP += bounty.rewardXP; // Award Bonus XP
                
                new Notice(`🎯 BOUNTY COMPLETE: You've pinned down '${bounty.archetype}'! (+${bounty.rewardXP} XP)`);
                // Trigger Achievement Event if needed
            } else {
                new Notice(`🎯 Bounty Progress: ${bounty.count}/${bounty.target} for '${bounty.archetype}'`);
            }
            
            await this.plugin.saveSettings();
        }
    }

    // --- NEW: L39 Mentor Review Export ---

    /**
     * Exports all loss logs related to a specific topic into a single Markdown file.
     */
    public async exportTopicSummary(topicName: string) {
        const folder = this.getLossLogFolder();
        const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder));
        
        // 1. Filter logs for the topic
        const relevantLogs = [];
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const topics = cache?.frontmatter?.syllabusTopics || [];
            // Check if topics array contains [[TopicName]] or just TopicName
            if (topics.some((t: string) => t.includes(topicName))) {
                relevantLogs.push({
                    file,
                    frontmatter: cache?.frontmatter,
                    content: await this.app.vault.read(file)
                });
            }
        }

        if (relevantLogs.length === 0) {
            new Notice(`No failures found for topic: ${topicName}`);
            return;
        }

        // 2. Generate Report Content
        let report = `# 📁 Labyrinth Export: ${topicName}\n`;
        report += `**Generated**: ${new Date().toLocaleString()}\n`;
        report += `**Total Failures**: ${relevantLogs.length}\n\n`;
        report += `> This document compiles all recorded failures, root causes, and solutions for "${topicName}". Use it to identify recurring patterns.\n\n`;
        report += `---\n\n`;

        // Sort by date (oldest to newest) to show evolution
        relevantLogs.sort((a, b) => (a.frontmatter?.timestamp || "").localeCompare(b.frontmatter?.timestamp || ""));

        for (const log of relevantLogs) {
            const fm = log.frontmatter;
            const date = fm?.timestamp ? new Date(fm.timestamp).toLocaleDateString() : "Unknown Date";
            
            report += `## 📅 ${date} | ${fm?.failureType || "Failure"}\n`;
            report += `**Source Task**: ${fm?.sourceTask}\n`;
            report += `**Archetypes**: ${fm?.failureArchetypes?.join(", ")}\n`;
            
            // Extract Thread nicely
            if (fm?.ariadnesThread) {
                report += `**🧵 Ariadne's Thread**: ${fm.ariadnesThread}\n`;
            }

            // Extract Body (removing frontmatter)
            const body = log.content.replace(/^---[\s\S]+?---\n/, "").trim();
            // Indent body for readability or put in a callout
            report += `\n> [!failure]- Log Detail\n> ${body.replace(/\n/g, "\n> ")}\n\n`;
            report += `---\n`;
        }

        // 3. Save File
        const exportPath = `Labyrinth Export - ${topicName.replace(/[\\/:?*"<>|]/g, "")}.md`;
        await this.app.vault.create(exportPath, report);
        new Notice(`Export created: ${exportPath}`);
        this.app.workspace.openLinkText(exportPath, "", true);
    }

  public getLevelInfo() {
        const currentXP = this.plugin.settings.labyrinthXP;
        // Find highest level reached
        const currentLevelObj = [...XP_LEVELS].reverse().find(l => currentXP >= l.xp) || XP_LEVELS[0];
        
        // Find next level
        const nextLevelIndex = XP_LEVELS.indexOf(currentLevelObj) + 1;
        const nextLevelObj = XP_LEVELS[nextLevelIndex];

        return {
            current: currentLevelObj,
            next: nextLevelObj, // undefined if max level
            progress: nextLevelObj ? ((currentXP - currentLevelObj.xp) / (nextLevelObj.xp - currentLevelObj.xp)) * 100 : 100
        };
    }

    // Call this whenever XP changes
    public checkLevelUp(oldXP: number, newXP: number) {
        const oldLevel = [...XP_LEVELS].reverse().find(l => oldXP >= l.xp) || XP_LEVELS[0];
        const newLevel = [...XP_LEVELS].reverse().find(l => newXP >= l.xp) || XP_LEVELS[0];

        if (newLevel.level > oldLevel.level) {
            new Notice(`🎉 LEVEL UP! You are now a ${newLevel.title} (Lvl ${newLevel.level})`);
            // Play a special sound?
        }
    }  

  public getPendingLogs(): PendingLossLogContext[] {
    return this.settings.lossLogPending as PendingLossLogContext[];
  }

  public removePendingLog(index: number): void {
    const updatedPendingLogs = [...this.settings.lossLogPending];
    updatedPendingLogs.splice(index, 1);
    this.settings.lossLogPending = updatedPendingLogs as any[];
  }

  public clearMinotaurHistory(): void {
    this.settings.minotaurHistory = [];
  }

  public getMinotaurHistory(): { date: string; archetype: string }[] {
    return this.settings.minotaurHistory;
  }

  public showEscapeMechanicNotice(): void {
    new Notice("The thread is set. A path out has been mapped.", 5000);
  }
}