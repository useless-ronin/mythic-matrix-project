// src/services/RitualService.ts

import { App, Notice, TFile, moment } from 'obsidian';
import { MythicMatrixSettings } from '../constants';
import { LossLogService } from './LossLogService';
import { AlchemistService } from './AlchemistService'; // Import if needed, or access via file cache
import MythicMatrixPlugin from '../main';

export class RitualService {
    private app: App;
    private plugin: MythicMatrixPlugin;
    private settings: MythicMatrixSettings;
    private lossLogService: LossLogService;

    constructor(app: App, plugin: MythicMatrixPlugin, lossLogService: LossLogService) {
        this.app = app;
        this.plugin = plugin;
        this.settings = plugin.settings;
        this.lossLogService = lossLogService;
    }

    public updateSettings(settings: MythicMatrixSettings) {
        this.settings = settings;
    }

    /**
     * Generates the Weekly Time Capsule note.
     * Call this BEFORE clearing queues in the weekly reset.
     */
    public async generateTimeCapsule(): Promise<void> {
        console.log("[RitualService] Generating Time Capsule...");
        
        const now = moment();
        const weekNum = now.format("WW");
        const year = now.format("YYYY");
        const fileName = `Time Capsule ${year}-W${weekNum}.md`;
        const folderPath = this.settings.timeCapsuleFolder;

        // 1. Ensure folder exists
        if (!await this.app.vault.adapter.exists(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }

        const filePath = `${folderPath}/${fileName}`;
        
        // 2. Check if already exists
        if (await this.app.vault.adapter.exists(filePath)) {
            new Notice(`Time Capsule for Week ${weekNum} already exists. Aborting to prevent overwrite.`);
            return;
        }

        // 3. Gather Data
        const stats = await this.gatherWeeklyStats();

        // 4. Generate Content
        const content = this.formatTimeCapsule(stats, weekNum, year);

        // 5. Create File
        await this.app.vault.create(filePath, content);
        new Notice(`Time Capsule sealed: ${fileName}`);
    }

    private async gatherWeeklyStats() {
        const oneWeekAgo = moment().subtract(7, 'days');
        
        // A. Completed Tasks (Crucible)
        // Filter completedTasks from settings that were done in the last 7 days
        const completedTasks = this.settings.completedTasks.filter(t => 
            moment(t.completed).isAfter(oneWeekAgo)
        );

        // B. Labyrinth Logs (Failures)
        const lossFiles = this.app.vault.getMarkdownFiles().filter(f => 
            f.path.startsWith(this.settings.lossLogFolder)
        );
        
        const weeklyLosses = [];
        for (const file of lossFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            const dateStr = cache?.frontmatter?.timestamp;
            if (dateStr && moment(dateStr).isAfter(oneWeekAgo)) {
                weeklyLosses.push({
                    file: file,
                    archetypes: cache?.frontmatter?.failureArchetypes || [],
                    thread: cache?.frontmatter?.ariadnesThread || ""
                });
            }
        }

        // C. Alchemist Logs (Reflections)
        const alchemistFiles = this.app.vault.getMarkdownFiles().filter(f => 
            f.path.startsWith(this.settings.alchemistLogFolder)
        );
        
        const weeklyReflections = [];
        for (const file of alchemistFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            // Assuming filename has timestamp or frontmatter has 'created'
            const created = cache?.frontmatter?.created || file.stat.ctime;
            if (moment(created).isAfter(oneWeekAgo)) {
                weeklyReflections.push({
                    file: file,
                    insight: cache?.frontmatter?.insight || ""
                });
            }
        }

        return {
            completedTasks,
            weeklyLosses,
            weeklyReflections
        };
    }

    private formatTimeCapsule(stats: any, week: string, year: string): string {
        const { completedTasks, weeklyLosses, weeklyReflections } = stats;
        const today = moment().format("YYYY-MM-DD");

        let md = `---
type: time-capsule
week: ${week}
year: ${year}
date: ${today}
xp_gained: ${(completedTasks.length * 10) + (weeklyLosses.length * 10) + (weeklyReflections.length * 15)}
tags: [ritual/weekly]
---\n\n`;

        md += `# ⏳ Time Capsule: Week ${week}, ${year}\n\n`;
        
        // 1. The Minotaur & The Labyrinth
        md += `## 🕯️ The Labyrinth\n`;
        md += `**Minotaur Status**: ${this.settings.currentMinotaur || "Dormant"}\n`;
        md += `**Streak**: ${this.settings.minotaurStreak} Days\n\n`;
        
        if (weeklyLosses.length > 0) {
            md += `### 🧵 Threads Found (L31)\n`;
            weeklyLosses.forEach((loss: any) => {
                if (loss.thread) md += `- ${loss.thread} ([[${loss.file.basename}]])\n`;
            });
        } else {
            md += `_No failures logged this week. A quiet journey._\n`;
        }
        md += `\n`;

        // 2. The Crucible (Tasks)
        md += `## 🔥 The Crucible\n`;
        md += `**Tasks Completed**: ${completedTasks.length}\n`;
        if (completedTasks.length > 0) {
            md += `> [!success]- Task Log\n`;
            completedTasks.forEach((t: any) => {
                md += `> - [x] ${t.text}\n`;
            });
        }
        md += `\n`;

        // 3. The Alchemist (Insights)
        md += `## 🧪 Alchemist's Distillations\n`;
        if (weeklyReflections.length > 0) {
            weeklyReflections.forEach((ref: any) => {
                if (ref.insight) md += `- 💡 ${ref.insight} ([[${ref.file.basename}]])\n`;
            });
        } else {
            md += `_No deep reflections recorded._\n`;
        }
        
        md += `\n---\n*Generated by Mythic Matrix Plugin*`;

        return md;
    }
}