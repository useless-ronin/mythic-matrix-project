// src/views/WeaverLoomView.ts

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { LoomGenerationModal } from '../modals/LoomGenerationModal';

declare global {
  interface Window {
    DataviewAPI?: any;
  }
}

export const WEAVER_LOOM_VIEW_TYPE = 'weaver-loom-view';

export class WeaverLoomView extends ItemView {
    plugin: MythicMatrixPlugin;
    private renderWrapper: () => void;

    constructor(leaf: WorkspaceLeaf, plugin: MythicMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.renderWrapper = this.render.bind(this);
    }

    getViewType(): string {
        return WEAVER_LOOM_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Weaver's Loom";
    }

    getIcon(): string {
        return "combine";
    }

    async onOpen(): Promise<void> {
        this.plugin.eventBus.on('weaver:pending-updated', this.renderWrapper);
        this.render();
    }

    async onClose(): Promise<void> {
        this.plugin.eventBus.off('weaver:pending-updated', this.renderWrapper);
        this.containerEl.empty();
    }

    private render = (): void => {
        this.containerEl.empty();
        const container = this.containerEl;

        // --- Header ---
        const headerEl = container.createDiv({ cls: 'weaver-view-header' });
        headerEl.createEl('h2', { text: 'Weaver\'s Loom Workbench' });
        const generateBtn = headerEl.createEl('button', { text: 'Generate New Loom Task' });
        generateBtn.onclick = () => {
            new LoomGenerationModal(this.app, (taskText: string) => { // ← TYPE taskText
                const editor = this.app.workspace.activeEditor?.editor;
                if (editor) {
                    editor.replaceSelection(`- [ ] ${taskText}\n`);
                } else {
                    new Notice("No active editor to add task to.");
                }
                }).open();
        };
        

        // --- Pending Synthesis Queue ---
        container.createEl('h3', { text: 'Pending Synthesis' });
        const pendingContainer = container.createDiv({ cls: 'weaver-pending-container' });
        const pendingLooms = this.plugin.settings.weaverPending || [];

        if (pendingLooms.length === 0) {
            pendingContainer.createEl('p', { text: 'Your synthesis queue is clear. Well done!', cls: 'weaver-empty-message' });
        } else {
            pendingLooms.forEach(task => {
                const card = pendingContainer.createDiv({ cls: 'weaver-pending-card' });
                const info = card.createDiv();
                info.createEl('strong', { text: `Type: ${task.loomType.charAt(0).toUpperCase() + task.loomType.slice(1)}` });
                info.createEl('div', { text: `Topics: ${task.topics.map((t: string) => `[[${t}]]`).join(', ')}` });

                const processBtn = card.createEl('button', { text: 'Synthesize Now', cls: 'mod-cta' });
                processBtn.onclick = () => {
                    this.plugin.synthesisService.processSpecificPendingLoom(task);
                };
            });
        }

        // --- Analytics Section ---
        this.renderAnalytics(container);
    };

    private async renderAnalytics(container: HTMLElement): Promise<void> {
        container.createEl('h3', { text: 'Analytics' });

        const dvApi = (this.app as any).plugins?.plugins?.dataview?.api;
        if (!dvApi) {
            container.createEl('p', { text: 'Install and enable the Dataview plugin to see analytics.' });
            return;
        }

        const synthesisFolder = this.plugin.settings.synthesisNoteFolder || "50 Synthesis";

        // ⭐ Highest Quality Insights
        const qualityContainer = container.createDiv();
        qualityContainer.createEl('h4', { text: '⭐ Highest Quality Insights' });
        try {
            const qualityResult = await dvApi.query(`
                TABLE loomTopics AS "Topics", loomQuality AS "Quality"
                FROM "${synthesisFolder}"
                WHERE loomQuality
                SORT loomQuality DESC
                LIMIT 10
            `);
            qualityContainer.appendChild(qualityResult.el);
        } catch (e) {
            qualityContainer.createEl('p', { text: 'Failed to load quality insights.' });
        }

        // 📊 Looms by Type
        const typeContainer = container.createDiv();
        typeContainer.createEl('h4', { text: '📊 Looms by Type' });
        try {
            const typeResult = await dvApi.query(`
                LIST rows.file.link
                FROM "${synthesisFolder}"
                WHERE loomType
                GROUP BY loomType
            `);
            typeContainer.appendChild(typeResult.el);
        } catch (e) {
            typeContainer.createEl('p', { text: 'Failed to load loom types.' });
        }
    }
}