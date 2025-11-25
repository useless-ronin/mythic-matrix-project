// src/services/SynthesisService.ts

import { App, Notice, TFile } from 'obsidian';
import { EventBus } from './EventBus';
import { MythicMatrixSettings } from '../constants';
import { WeaverLoomModal } from '../modals/WeaverLoomModal';
import MythicMatrixPlugin from '../main';

export interface LoomTaskDetails {
    loomType: string;
    topics: string[];
    originalTask: string;
    aura?: string;
}

export type SynthesisContent = Record<string, string>;

export class SynthesisService {
    private app: App;
    private eventBus: EventBus;
    private settings: MythicMatrixSettings;
    private plugin: MythicMatrixPlugin;

    constructor(app: App, eventBus: EventBus, settings: MythicMatrixSettings, plugin: MythicMatrixPlugin) {
        this.app = app;
        this.eventBus = eventBus;
        this.settings = settings;
        this.plugin = plugin;
        this.eventBus.on('loomTaskCompleted', this.handleLoomTaskCompletion);
    }

    private handleLoomTaskCompletion = (taskText: string) => {
        const loomDetails = this.parseLoomTask(taskText);
        if (!loomDetails) return;
        if (!this.validateLoomSources(loomDetails.topics)) {
            new Notice("Synthesis cancelled: One or more source notes do not exist.", 5000);
            return;
        }
        new WeaverLoomModal(this.app, loomDetails, this, this.plugin).open();
    };

    private parseLoomTask(taskText: string): LoomTaskDetails | null {
        const loomRegex = /\(Loom Type:\s*(Triad|Tension|Evolution|Constellation)\)/i;
        const match = taskText.match(loomRegex);
        if (!match) return null;
        const loomType = match[1].toLowerCase();
        const topics = taskText.match(/\[\[(.*?)\]\]/g)?.map(link => link.slice(2, -2)) || [];
        if (topics.length === 0) return null;
        const auraRegex = /#aura-(high|mid|low)/;
        const auraMatch = taskText.match(auraRegex);
        const aura = auraMatch ? auraMatch[0] : undefined;
        return { loomType, topics, originalTask: taskText, aura };
    }

    private validateLoomSources(topics: string[]): boolean {
        return topics.every(topic => this.app.metadataCache.getFirstLinkpathDest(topic, "") !== null);
    }

    public async createSynthesisNote(details: LoomTaskDetails, synthesisContent: SynthesisContent, isRevision: boolean = false): Promise<void> {
        const folderPath = this.settings.synthesisNoteFolder || "50 Synthesis";
        await this.app.vault.createFolder(folderPath).catch(() => {});

        const safeFileName = `Loom - ${details.topics.join(' and ')}`.replace(/[\\/:?*"<>|]/g, '-');
        const filePath = `${folderPath}/${safeFileName}.md`;

        // 🔥 IF REVISION: APPEND INSTEAD OF OVERWRITE
        if (isRevision) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                new Notice(`Cannot re-weave: ${safeFileName} not found.`);
                return;
            }
            const existingContent = await this.app.vault.read(file);
            const timestamp = new Date().toISOString().slice(0, 10);
            const reweaveSection = `\n### 🔁 Re-Woven on ${timestamp}\n`;
            const formattedContent = Object.entries(synthesisContent)
                .filter(([, content]) => content.trim())
                .map(([prompt, content]) => `**${prompt}**: ${content}`)
                .join('\n');
            await this.app.vault.modify(file, existingContent + reweaveSection + formattedContent);
            new Notice(`Loom re-woven: ${safeFileName}`);
            return;
        }

        // 🔥 CONFLICT DETECTION
        const existingLooms = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folderPath));
        const newTopicsSet = new Set(details.topics);
        for (const file of existingLooms) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            if (!fm?.loomType || !fm.loomTopics) continue;
            const existingTopics = (Array.isArray(fm.loomTopics) ? fm.loomTopics : [fm.loomTopics])
                .map(t => typeof t === 'string' ? t.replace(/\[\[|\]\]/g, '') : '')
                .filter(t => t !== '');
            const existingTopicsSet = new Set(existingTopics);
            if (newTopicsSet.size === existingTopicsSet.size &&
                [...newTopicsSet].every(t => existingTopicsSet.has(t))) {
                new Notice(`Conflict: Synthesis for these topics already exists at "${file.path}"`, 7000);
                return;
            }
        }

        // 🔥 QUALITY & DEPTH SCORING
        const requiredFields = [
            'Common Principle', 'Core Point of Conflict', 'Causative Factors',
            'Real-World Manifestation', 'UPSC Application'
        ];
        let filledFields = 0;
        for (const field of requiredFields) {
            if (synthesisContent[field]?.trim()) filledFields++;
        }
        const loomQuality = Math.min(filledFields, 5);
        const loomDepthTag = loomQuality >= 3 ? '#loom/deep-dive' : '#loom/surface-level';

        // 🔥 BUILD FRONTMATTER
        const frontmatter: Record<string, any> = {
            loomType: details.loomType,
            loomQuality: loomQuality,
            loomTopics: details.topics.map(t => `[[${t}]]`),
            provenance: {
                sourceTask: details.originalTask.replace(/"/g, '\\"'),
                completionDate: new Date().toISOString().slice(0, 10),
                ...(details.aura && { aura: details.aura })
            }
        };

        // 🔥 ADD decayRisk
        const decayRisk = this.calculateDecayRisk(details.topics);
        frontmatter.decayRisk = decayRisk;

        // Auto-detect syllabus papers
        const syllabusPapers = new Set<string>();
        for (const topic of details.topics) {
            const file = this.app.metadataCache.getFirstLinkpathDest(topic, "");
            if (file) {
                const cache = this.app.metadataCache.getFileCache(file);
                const tags = cache?.frontmatter?.tags;
                if (Array.isArray(tags)) {
                    for (const tag of tags) {
                        if (typeof tag === 'string' && /^#gs[1-4]$/.test(tag)) {
                            syllabusPapers.add(tag);
                        }
                    }
                }
            }
        }
        if (syllabusPapers.size > 0) frontmatter.syllabusPapers = Array.from(syllabusPapers);

        // Build YAML
        let noteContent = "---\n";
        for (const [key, value] of Object.entries(frontmatter)) {
            if (Array.isArray(value)) {
                noteContent += `${key}:\n${value.map(v => `  - "${v}"`).join('\n')}\n`;
            } else if (typeof value === 'object') {
                noteContent += `${key}:\n`;
                for (const [k, v] of Object.entries(value)) {
                    noteContent += `  ${k}: ${JSON.stringify(v)}\n`;
                }
            } else {
                noteContent += `${key}: ${JSON.stringify(value)}\n`;
            }
        }
        noteContent += "---\n\n";

        // Format content
        const formattedContent = Object.entries(synthesisContent)
            .filter(([, content]) => content.trim())
            .map(([prompt, content]) => `## ${prompt}\n\n${content}\n`)
            .join('\n');
        noteContent += `# Synthesis: ${details.loomType}\n\n${formattedContent}`;
        noteContent += `\n\n${loomDepthTag}`;

        await this.app.vault.create(filePath, noteContent);
        await this.embedInSourceNotes(safeFileName, details.topics);
        this.scheduleSilentCouncilTask(safeFileName);
        this.scheduleLoomEchoTask(safeFileName);
        this.suggestChainedLoom(details); // ← Trigger chaining

        new Notice(`Synthesis note created: ${safeFileName}`);

        // 🔥 SCHEDULE CODEX SYNC IF HIGH QUALITY
        if (loomQuality >= 4) {
            this.scheduleCodexSync(safeFileName, details.topics);
        }
    }

    // 🔥 FIXED: Single implementation of suggestChainedLoom
    private suggestChainedLoom(details: LoomTaskDetails) {
        const firstTopicFile = this.app.vault.getAbstractFileByPath(`${details.topics[0]}.md`);
        if (firstTopicFile instanceof TFile) {
            const backlinks = this.app.metadataCache.resolvedLinks[firstTopicFile.path] || {};
            const relatedPaths = Object.keys(backlinks);
            if (relatedPaths.length > 0) {
                const relatedFile = this.app.vault.getAbstractFileByPath(relatedPaths[0]);
                if (relatedFile instanceof TFile) {
                    const newTopic = relatedFile.basename;
                    const newTopics = [newTopic, ...details.topics.slice(1)];
                    const taskText = `Synthesize ${newTopics.map(t => `[[${t}]]`).join(', ')} (Loom Type: ${details.loomType})`;
                    this.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
                    this.plugin.saveSettings();
                    new Notice("Chained loom suggested", 3000);
                }
            }
        }
    }

    private async scheduleCodexSync(loomFileName: string, topics: string[]) {
        const loomFilePath = `${this.settings.synthesisNoteFolder}/${loomFileName}.md`;
        const loomFile = this.app.vault.getAbstractFileByPath(loomFilePath);
        if (loomFile instanceof TFile && this.plugin.revisionScheduler) {
            await this.app.fileManager.processFrontMatter(loomFile, fm => {
                fm.syncToCodex = true;
            });
        }
    }

    private calculateDecayRisk(topics: string[]): number {
        let maxRisk = 0;
        for (const topic of topics) {
            const file = this.app.metadataCache.getFirstLinkpathDest(topic, "");
            if (!file) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const lastRevised = cache?.frontmatter?.LastRevised as string;
            if (lastRevised) {
                const daysSinceRevision = Math.floor(
                    (Date.now() - new Date(lastRevised).getTime()) / (1000 * 60 * 60 * 24)
                );
                maxRisk = Math.max(maxRisk, Math.min(daysSinceRevision / 30, 5));
            }
        }
        return Math.round(maxRisk);
    }

    public async checkLoomMastery(loomFile: TFile) {
        const cache = this.app.metadataCache.getFileCache(loomFile);
        const revisionLevel = cache?.frontmatter?.revisionLevel || 0;
        if (revisionLevel >= 3) {
            const content = await this.app.vault.read(loomFile);
            // 🔥 SAFE REGEX (no 's' flag)
            const insightMatch = content.match(/## (Common Principle|Core Point of Conflict|Causative Factors|GS1: Society\/Geography)\s+(.+?)(\n##|\n$)/);
            const insight = insightMatch ? insightMatch[2].trim() : "Mastered synthesis.";

            const topics = (cache?.frontmatter?.loomTopics as string[]) || [];
            for (const topic of topics) {
                const topicFile = this.app.vault.getAbstractFileByPath(`${topic}.md`);
                if (topicFile instanceof TFile) {
                    const embed = `\n> [!NOTE] 🌟 Mastered Synthesis\n> ${insight}\n> — from [[${loomFile.basename}]]\n`;
                    await this.app.vault.append(topicFile, embed);
                }
            }
        }
    }

    private async embedInSourceNotes(loomNoteName: string, topics: string[]) {
        for (const topic of topics) {
            const file = this.app.metadataCache.getFirstLinkpathDest(topic, "");
            if (!file) continue;
            const embedText = `\n## 🔗 Synthesized Insights\n![[${loomNoteName}]]\n`;
            await this.app.vault.append(file, embedText);
        }
    }

    public async deferSynthesis(details: LoomTaskDetails): Promise<void> {
        this.settings.weaverPending.push(details);
        await this.plugin.saveSettings();
        this.eventBus.emit('weaver:pending-updated');
        new Notice("Synthesis deferred to Mythos Hub.");
    }

    public async processSpecificPendingLoom(taskToProcess: LoomTaskDetails): Promise<void> {
        const onSaveCallback = async () => {
            const taskIndex = this.settings.weaverPending.findIndex(
                p => p.originalTask === taskToProcess.originalTask
            );
            if (taskIndex > -1) {
                this.settings.weaverPending.splice(taskIndex, 1);
                await this.plugin.saveSettings();
                this.eventBus.emit('weaver:pending-updated');
            }
        };
        new WeaverLoomModal(this.app, taskToProcess, this, this.plugin, onSaveCallback).open();
    }

    // --- NEW METHOD: Process the Next Pending Loom ---
    public async processNextPendingLoom(): Promise<void> {
        if (this.settings.weaverPending.length > 0) {
            const nextTask = this.settings.weaverPending[0]; // FIFO - Get the first item
            await this.processSpecificPendingLoom(nextTask); // Process it using the existing logic
        } else {
            new Notice("No pending Weaver's Loom tasks to process.");
        }
    }
    // --- END NEW METHOD ---

    private scheduleSilentCouncilTask(loomNotePath: string) {
        const taskText = `Silent Council: Review emergent connections from [[${loomNotePath.split('/').pop()}]]`;
        this.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
        this.plugin.saveSettings();
    }

    private scheduleLoomEchoTask(loomNotePath: string) {
        const basename = loomNotePath.split('/').pop()?.replace('.md', '') || 'Loom Note';
        const echoTasks = [
            `Distill the core insight of [[${basename}]] into a 30-word summary`,
            `Find one statistic to support the argument in [[${basename}]]`,
            `Convert [[${basename}]] into a prelims one-liner`
        ];
        const taskText = echoTasks[Math.floor(Math.random() * echoTasks.length)];
        this.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
        this.plugin.saveSettings();
    }

     public updateSettings(settings: MythicMatrixSettings): void {
      this.settings = settings;
      // Add any specific logic here if the service needs to react to setting changes
      console.log("[SynthesisService] Settings updated.");
  }
}