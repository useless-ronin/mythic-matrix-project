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

  public incrementLoomDeferralCount(taskId: string): void {
    if (!this.plugin.settings.loomDeferralCounts) {
      this.plugin.settings.loomDeferralCounts = {};
    }
    const currentCount = this.plugin.settings.loomDeferralCounts[taskId] || 0;
    this.plugin.settings.loomDeferralCounts[taskId] = currentCount + 1;
    this.plugin.saveSettings();
  }

  public getLoomDeferralCount(taskId: string): number {
    return this.plugin.settings.loomDeferralCounts?.[taskId] || 0;
  }

  public resetLoomDeferralCount(taskId: string): void {
    if (this.plugin.settings.loomDeferralCounts && this.plugin.settings.loomDeferralCounts.hasOwnProperty(taskId)) {
      this.plugin.settings.loomDeferralCounts[taskId] = 0;
      this.plugin.saveSettings();
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

      return notePath;
    } catch (error) {
      console.error("Error creating loss log:", error);
      new Notice(`Failed to create loss log note.`);
      throw error;
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

  // --- NEW: Extracted File Creation Logic ---
  private async createLossLogNote(lossData: LossLogData): Promise<string> {
    const folderPath = normalizePath(this.settings.lossLogFolder);
    await this.ensureFolderExists(folderPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${timestamp}.md`;
    const notePath = normalizePath(`${folderPath}/${fileName}`);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const failureTag = `#failed-on-${dateStr}`;

    // L82: Check for Decay Correlation
    let shouldAddFadedInkTag = false;
    if (lossData.syllabusTopics && lossData.syllabusTopics.length > 0) {
      for (const topicLink of lossData.syllabusTopics) {
        const match = topicLink.match(/\[\[([^\]]+)\]\]/);
        if (match) {
          const topicFile = this.app.vault.getFiles().find(f => f.basename === match[1]);
          if (topicFile) {
            const cache = this.app.metadataCache.getFileCache(topicFile);
            const decayRisk = cache?.frontmatter?.decay_risk as number;
            if (decayRisk && decayRisk > 3) {
              shouldAddFadedInkTag = true;
              break;
            }
          }
        }
      }
    }

    const proactiveTag = lossData.provenance?.origin === "scrying-pool" ? " #loss/future-risk" : "";
    const fadedInkTag = shouldAddFadedInkTag ? " #failure/faded-ink" : "";

    const frontmatterYaml = this.generateFrontmatterYaml(lossData, failureTag);
    let bodyContent = this.generateBodyContent(lossData, failureTag);
    if (proactiveTag) bodyContent += `\n\n${proactiveTag}`;
    if (fadedInkTag) bodyContent += `\n\n${fadedInkTag}`;

    const noteContent = `---\n${frontmatterYaml}---\n\n${bodyContent}`;
    const file = await this.app.vault.create(notePath, noteContent);

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
      this.eventBus.emit(EVENT_MINOTAUR_UPDATED, { oldMinotaur, newMinotaur: newMinotaur });
      // -> ADD THIS LINE:
      this.activateTheseusProtocol(newMinotaur); 
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
    };
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