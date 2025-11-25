// src/modals/LossLogModal.ts (Refined with L45, L71, L72, L74)

import { App, Modal, Setting, TextAreaComponent, Notice } from "obsidian";
import { LossLogService, PendingLossLogContext } from "../services/LossLogService";
import { LossLogData, FailureType, DEFAULT_FAILURE_ARCHETYPES } from "../constants";

// Define the initial context structure for the main loss log modal
interface InitialLossLogContext {
  sourceTask?: string;
  initialFailureType?: FailureType;
  initialArchetypes?: string[];
  initialAura?: string;
  initialSyllabusTopics?: string[]; // Example of an additional field
  // --- ADD FIELD FOR ORIGINAL SOURCE TASK ID (L51, L24, L85) ---
  sourceTaskId?: string; // Could be a Crucible task ID or a file path for auto-tagging
  // --- END ADD ---
  // --- ADD FIELD FOR PROACTIVE MODE (L45, L15) ---
  isProactiveMode?: boolean; // Flag to indicate if opened from proactive context (Scrying Pool)
  // --- END ADD ---
  // Add other fields if needed for pre-filling
}

// --- NEW: Define Thread Templates (L72) ---
const THREAD_TEMPLATES: Record<string, string> = {
  "conceptual-error": "Always cross-check fundamental concepts with the primary source (e.g., Laxmikanth, NCERT) before answering.",
  "time-mismanagement": "Always set a strict time limit for each section of the task and use a timer.",
  "source-deficit": "Always verify the credibility and depth of source material before synthesizing.",
  "silly-mistake": "Always review the final answer/check calculations before submitting.",
  "faded-knowledge": "Schedule a focused revision session on this topic within 24 hours.",
  // Add more templates as needed
};
// --- END NEW ---

// --- NEW: Define Keyword Suggestions (L71) ---
const KEYWORD_SUGGESTIONS: Record<string, string[]> = {
  "second-guessed": ["overthinking"],
  "doubt": ["overthinking"],
  "forgot": ["faded-knowledge", "source-deficit"],
  "confused": ["conceptual-error"],
  "time": ["time-mismanagement"],
  "ran-out": ["time-mismanagement"],
  "source": ["source-deficit"],
  "credibility": ["source-deficit"],
  "procrastinated": ["process-failure"],
  "distracted": ["process-failure"],
  "tired": ["process-failure"],
  // Add more mappings as needed
};
// --- END NEW ---

export class LossLogModal extends Modal {
  private lossLogService: LossLogService;
  private onSubmit: ( data:LossLogData) => void;
  private initialContext?: InitialLossLogContext; // Store the initial context provided by the caller

  // State variables to hold user input (as before)
  private sourceTask: string = "";
  private failureType: FailureType | null = null;
  private selectedArchetypes: string[] = [];
  private impact: number = 1;
  private syllabusTopics: string = "";
  private syllabusPapers: string = "";
  private aura: string = "#aura-mid";
  private emotionalState: string = "";
  private rootCauseChain: string[] = [""];
  private ariadnesThread: string = "";
  private counterFactual: string = "";
  private evidenceLink: string = "";
  private linkedMockTest: string = "";
  // --- ADD STATE FOR NEW FIELD (L45) ---
  private failureRealizationPoint: string = ""; // e.g., "50%", "Near the end", "At the start"
  // --- END ADD ---

  // --- ADD STATE FOR PROACTIVE MODE (L15) ---
  private isProactiveMode: boolean = false;
  // --- END ADD ---

  constructor(app: App, lossLogService: LossLogService, onSubmit: ( data: LossLogData) => void, initialContext?: InitialLossLogContext) {
    super(app);
    this.lossLogService = lossLogService;
    this.onSubmit = onSubmit;
    this.initialContext = initialContext;

    // Pre-populate state variables from initialContext if provided (e.g., from Crucible button click or FeedbackModal prompt)
    if (this.initialContext?.sourceTask) {
      this.sourceTask = this.initialContext.sourceTask;
    }
    if (this.initialContext?.initialFailureType) {
      this.failureType = this.initialContext.initialFailureType;
    }
    if (this.initialContext?.initialArchetypes) {
      this.selectedArchetypes = [...this.initialContext.initialArchetypes]; // Create a copy
    }
    if (this.initialContext?.initialAura) {
      this.aura = this.initialContext.initialAura;
    }
    if (this.initialContext?.initialSyllabusTopics) {
      this.syllabusTopics = this.initialContext.initialSyllabusTopics.join(", "); // Join array into string for input field
    }
    // Pre-populate other fields if initialContext provides them
    // --- SET PROACTIVE MODE FLAG (L15) ---
    this.isProactiveMode = this.initialContext?.isProactiveMode || false; // Set flag based on initial context
    // --- END SET ---

    
  }

 // --- ADD: Helper method to update archetype display (Fixes error 1) ---
  private updateArchetypeDisplay() {
    // Find the archetype display element (created in onOpen)
    const archetypeDisplay = this.containerEl.querySelector('.selected-archetypes-display');
    if (archetypeDisplay) {
      archetypeDisplay.textContent = `Selected: ${this.selectedArchetypes.join(", ") || "None"}`;
    }
  }
  // --- END ADD ---

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("loss-log-modal");

    // --- UPDATE HEADER BASED ON MODE (L15) ---
    if (this.isProactiveMode) {
      contentEl.createEl("h2", { text: "Scrying Pool: Log Future Risk" });
      contentEl.createEl("p", { text: "Describe a potential obstacle or risk you anticipate.", cls: "modal-subtitle" });
    } else {
      contentEl.createEl("h2", { text: "Enter the Labyrinth" });
      contentEl.createEl("p", { text: "Log a failure that has already occurred.", cls: "modal-subtitle" });
    }
    // --- END UPDATE ---

    // --- 1. Failure Triage (L1) - Pre-fill for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "1. Anticipated Failure Type" : "1. Failure Type") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "What type of potential failure are you anticipating?" // Update desc for proactive mode
          : "What type of failure was this?"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select...")
          .addOption("Knowledge Gap", "Knowledge Gap (Didn't know)")
          .addOption("Skill Gap", "Skill Gap (Knew but couldn't apply)")
          .addOption("Process Failure", "Process Failure (Planning/Time/Execution)")
          .setValue(this.failureType || (this.isProactiveMode ? "Process Failure" : "")) // Pre-select Process Failure for proactive mode
          .onChange((value) => {
            this.failureType = value as FailureType;
            // --- NEW: Auto-Suggest Archetypes based on Failure Type (L71) ---
            if (value === "Process Failure" && !this.selectedArchetypes.includes("process-failure")) {
                this.selectedArchetypes.push("process-failure");
                this.updateArchetypeDisplay(); // Refresh the display
            }
            // Add other suggestions based on type if desired.
            // --- END NEW ---
          })
      );

    // --- 2. Failure Archetype Tagging (L3) ---
    new Setting(contentEl)
      .setName("2. Failure Archetype(s)")
      .setDesc("Select one or more archetypes that describe the failure.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select...");
        this.lossLogService.getFailureArchetypes().forEach((archetype) => {
          dropdown.addOption(archetype, archetype);
        });
        dropdown.onChange((value) => {
          if (value && !this.selectedArchetypes.includes(value)) {
            this.selectedArchetypes.push(value);
            this.updateArchetypeDisplay(); // Refresh the display

            // --- NEW: Auto-Suggest Thread based on Archetype (L72) ---
            if (THREAD_TEMPLATES[value] && !this.ariadnesThread) { // Only suggest if thread is empty
                // Optionally, confirm with user before auto-filling
                if (confirm(`Suggest thread for '${value}': "${THREAD_TEMPLATES[value]}" Fill it in?`)) {
                    this.ariadnesThread = THREAD_TEMPLATES[value];
                    // Update the corresponding UI element if it exists
                    const threadTextArea = this.containerEl.querySelector('.ariadnes-thread-input') as HTMLTextAreaElement; // Find the input by class
                    if (threadTextArea) {
                        threadTextArea.value = this.ariadnesThread;
                    }
                }
            }
            // --- END NEW ---
          }
        });
      });
    // Create a div to display selected archetypes
    const archetypeDisplay = contentEl.createDiv({ cls: "selected-archetypes-display" });
    archetypeDisplay.setText(`Selected: ${this.selectedArchetypes.join(", ") || "None"}`);

    // --- NEW: Helper to update archetype display (L71, L72) ---
    const updateArchetypeDisplay = () => {
        archetypeDisplay.setText(`Selected: ${this.selectedArchetypes.join(", ") || "None"}`);
    };
    // --- END NEW ---

    // --- 3. Impact Score (L4) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName("3. Estimated Impact Score") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "Estimate the strategic impact if this potential failure occurs (1 = Minor, 5 = Critical)." // Update desc for proactive mode
          : "Rate the strategic impact of this failure (1 = Minor, 5 = Critical)."
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.impact)
          .onChange((value) => {
            this.impact = value;
          })
      );

    // --- 4. Source Task (from context or manual input) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "4. Anticipated Source Task / Scenario" : "4. Source Task") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "What task, activity, or scenario are you concerned about?" // Update desc for proactive mode
          : "What task or activity led to the failure?"
      )
      .addText((text) =>
        text
          .setPlaceholder(
            this.isProactiveMode
              ? "e.g., Explaining FRs vs DPSP in the upcoming GS2 mock test" // Update placeholder for proactive mode
              : "e.g., Explain FRs vs DPSP in GS2"
          )
          .setValue(this.sourceTask) // Pre-filled
          .onChange((value) => {
            this.sourceTask = value;

            // --- NEW: Auto-Suggest Archetypes based on Source Task Keywords (L71) ---
            // This runs whenever the source task text changes
            const lowerSourceTask = value.toLowerCase();
            for (const [keyword, suggestedArchetypes] of Object.entries(KEYWORD_SUGGESTIONS)) {
                if (lowerSourceTask.includes(keyword)) {
                    for (const archetype of suggestedArchetypes) {
                        if (!this.selectedArchetypes.includes(archetype)) {
                            this.selectedArchetypes.push(archetype);
                            console.log(`[LossLogModal] Auto-suggested archetype '${archetype}' based on keyword '${keyword}' in source task.`);
                        }
                    }
                    this.updateArchetypeDisplay(); // Refresh the display after suggestions
                }
            }
            // --- END NEW ---
          })
      );

    // --- 5. Syllabus Topics & Papers ---
    new Setting(contentEl)
      .setName("5. Syllabus Topics")
      .setDesc("Link the relevant topic notes (comma-separated, e.g., [[Topic A]], [[Topic B]]).")
      .addText((text) =>
        text
          .setPlaceholder("[[Topic A]], [[Topic B]]")
          .setValue(this.syllabusTopics)
          .onChange((value) => {
            this.syllabusTopics = value;
          })
      );

    new Setting(contentEl)
      .setName("6. Syllabus Papers")
      .setDesc("Which UPSC paper(s) does this relate to? (comma-separated, e.g., #gs2, #essay)")
      .addText((text) =>
        text
          .setPlaceholder("#gs2, #essay")
          .setValue(this.syllabusPapers)
          .onChange((value) => {
            this.syllabusPapers = value;
          })
      );

    // --- 6. Aura & Emotional State (L5) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "7. Energy & Emotion (Anticipated)" : "7. Energy & Emotion") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "Your anticipated energy level and emotional state during this potential challenge." // Update desc for proactive mode
          : "Your energy level and emotional state during the failure."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("#aura-high", "High Energy")
          .addOption("#aura-mid", "Medium Energy")
          .addOption("#aura-low", "Low Energy")
          .setValue(this.aura) // Pre-select aura if available from context or state
          .onChange((value) => {
            this.aura = value;
          })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select Emotion...")
          .addOption("Frustrated", "Frustrated")
          .addOption("Anxious", "Anxious")
          .addOption("Tired", "Tired")
          .addOption("Distracted", "Distracted")
          .addOption("Overconfident", "Overconfident")
          .addOption("Confused", "Confused")
          .setValue(this.emotionalState)
          .onChange((value) => {
            this.emotionalState = value;
          })
      );

    // --- 7. Root Cause Chain (5 Whys) (L2) - Adjust for Proactive (L15) ---
    const causeSection = contentEl.createDiv({ cls: "root-cause-section" });
    causeSection.createEl("h4", { text: this.isProactiveMode ? "8. Anticipated Root Cause Analysis (5 Whys)" : "8. Root Cause Analysis (5 Whys)" });
    causeSection.createEl("p", {
      text: this.isProactiveMode
        ? "Ask 'Why might this happen?' repeatedly to predict the core cause." // Update desc for proactive mode
        : "Ask 'Why?' repeatedly to find the core cause.",
      cls: "setting-item-description"
    });

    const causeInputsContainer = causeSection.createDiv({ cls: "cause-inputs-container" });

    const renderCauseInputs = () => {
      causeInputsContainer.empty();
      this.rootCauseChain.forEach((cause, index) => {
        new Setting(causeInputsContainer)
          .addText((text) =>
            text
              .setPlaceholder(
                this.isProactiveMode
                  ? `Why might ${index + 1}? (e.g., Because I haven't revised...)` // Update placeholder for proactive mode
                  : `Why ${index + 1}? (e.g., Because I didn't revise...)`
              )
              .setValue(cause)
              .onChange((value) => {
                this.rootCauseChain[index] = value;
              })
          )
          .addExtraButton((button) =>
            button.setIcon("x").setTooltip("Remove this cause").onClick(() => {
              if (this.rootCauseChain.length > 1) {
                this.rootCauseChain.splice(index, 1);
                renderCauseInputs();
              } else {
                this.rootCauseChain[0] = "";
              }
            })
          );
      });

      if (this.rootCauseChain.length < 5) {
        new Setting(causeInputsContainer)
          .addButton((btn) =>
            btn.setButtonText("+ Add Why").onClick(() => {
              this.rootCauseChain.push("");
              renderCauseInputs();
            })
          );
      }
    };

    renderCauseInputs();

    // --- 8. Ariadne's Thread (L6) - Adjust for Proactive (L15) and Add Auto-Gen (L74) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "9. Mitigation Principle" : "9. Ariadne's Thread") // Update name based on mode
      .setDesc(
        this.isProactiveMode
          ? "What principle or action could mitigate this anticipated risk?" // Update desc for proactive mode
          : "What reusable principle or action will prevent this type of failure in the future?"
      )
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder(
            this.isProactiveMode
              ? "e.g., Always cross-check constitutional concepts with Laxmikanth before the mock." // Update placeholder for proactive mode
              : "e.g., Always cross-check constitutional concepts with Laxmikanth before answering."
          )
          .setValue(this.ariadnesThread)
          .onChange((value) => {
            this.ariadnesThread = value;
          });
        textArea.inputEl.rows = 3;
        textArea.inputEl.addClass("ariadnes-thread-input"); // Add a class for potential selector access
      });

    // --- 9. Counter-Factual Prompt (L16) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "10. Preventive Action" : "10. Counter-Factual") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "What single different action could prevent this outcome?" // Update desc for proactive mode
          : "What single different action would have prevented this outcome?"
      )
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder(
            this.isProactiveMode
              ? "e.g., Review Laxmikanth Ch 6 before the mock." // Update placeholder for proactive mode
              : "e.g., Reviewed Laxmikanth Ch 6 before attempting."
          )
          .setValue(this.counterFactual)
          .onChange((value) => {
            this.counterFactual = value;
          });
        textArea.inputEl.rows = 2;
      });

    // --- 10. Evidence Attachment (L7) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "11. Potential Evidence Link (Optional)" : "11. Evidence Link (Optional)") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "Link to an image, file, or specific note section showing the *potential* failure scenario." // Update desc for proactive mode
          : "Link to an image, file, or specific note section showing the failure."
      )
      .addText((text) =>
        text
          .setPlaceholder(
            this.isProactiveMode
              ? "e.g., Screenshot Mock Q3 (anticipated difficulty).png or [[Source Note#^block-id]]" // Update placeholder for proactive mode
              : "e.g., Screenshot Mock Q3.png or [[Source Note#^block-id]]"
          )
          .setValue(this.evidenceLink)
          .onChange((value) => {
            this.evidenceLink = value;
          })
      );

    // --- 11. Linked Mock Test (L23) - Adjust for Proactive (L15) ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "12. Linked Upcoming Mock Test (Optional)" : "12. Linked Mock Test (Optional)") // Update name for proactive mode
      .setDesc(
        this.isProactiveMode
          ? "Link the *upcoming* mock test this risk relates to (e.g., [[Upcoming Mock Test 5 - GS2]])." // Update desc for proactive mode
          : "Link the mock test this failure occurred during (e.g., [[Mock Test 5 - GS2]])."
      )
      .addText((text) =>
        text
          .setPlaceholder(
            this.isProactiveMode
              ? "[[Upcoming Mock Test Name]]" // Update placeholder for proactive mode
              : "[[Mock Test Name]]"
          )
          .setValue(this.linkedMockTest)
          .onChange((value) => {
            this.linkedMockTest = value;
          })
      );

    // --- NEW: Time-to-Failure Metric (L45) ---
    new Setting(contentEl)
      .setName("13. Time-to-Failure Metric (Optional)")
      .setDesc("At what point in the task did you realize you were failing? (e.g., 20%, 80%, Near the end)")
      .addText((text) =>
        text
          .setPlaceholder("e.g., 50%, Near the end, At the start")
          .setValue(this.failureRealizationPoint)
          .onChange((value) => {
            this.failureRealizationPoint = value;
          })
      );
    // --- END NEW ---

    // --- NEW: Auto-Generate Thread Button (L74) ---
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Auto-Generate Thread from Reflection").onClick(() => {
          // This is a simple example. A more complex implementation might parse the body content.
          // For now, let's assume the user types the thread in the ariadnesThread field and we try to extract from there.
          // Or, parse the rootCauseChain for keywords.
          // Let's try parsing the rootCauseChain for a potential thread.
          const potentialThread = this.rootCauseChain.find(cause => cause.toLowerCase().includes("next time"));
          if (potentialThread && !this.ariadnesThread) { // Only auto-fill if thread is empty
            // Attempt to extract the part after "next time I will..."
            const match = potentialThread.match(/next time,?\s*i will\s+(.*)/i);
            if (match) {
                const extractedThread = match[1].trim();
                if (extractedThread) {
                    this.ariadnesThread = extractedThread.charAt(0).toUpperCase() + extractedThread.slice(1); // Capitalize first letter
                    // Update the UI element
                    const threadTextArea = this.containerEl.querySelector('.ariadnes-thread-input') as HTMLTextAreaElement;
                    if (threadTextArea) {
                        threadTextArea.value = this.ariadnesThread;
                    }
                    new Notice(`Auto-generated thread: ${this.ariadnesThread}`);
                }
            } else {
                // If no "next time I will" is found in causes, try the Ariadne's Thread field itself
                const matchInThread = this.ariadnesThread.match(/next time,?\s*i will\s+(.*)/i);
                if (matchInThread) {
                    const extractedThread = matchInThread[1].trim();
                    if (extractedThread) {
                        this.ariadnesThread = extractedThread.charAt(0).toUpperCase() + extractedThread.slice(1);
                        const threadTextArea = this.containerEl.querySelector('.ariadnes-thread-input') as HTMLTextAreaElement;
                        if (threadTextArea) {
                            threadTextArea.value = this.ariadnesThread;
                        }
                        new Notice(`Auto-generated thread from existing field: ${this.ariadnesThread}`);
                    }
                } else {
                    new Notice("Could not find a 'next time I will...' phrase in the root causes or thread field.");
                }
            }
          } else if (this.ariadnesThread) {
              new Notice("Ariadne's Thread field is already filled. Auto-generation skipped.");
          } else {
              new Notice("No root causes entered yet. Please add some first.");
          }
        })
      );
    // --- END NEW ---

    // --- Submit Buttons (L15: Adapt for Proactive Mode) ---
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.isProactiveMode ? "Log Risk" : "Log Failure") // Change button text for proactive mode
          .setCta()
          .onClick(() => {
            this.submitForm(false); // Call submitForm, indicating NOT a deferred log
          })
      )
      .addButton((btn) =>
        btn.setButtonText(this.isProactiveMode ? "Log Risk Later" : "Log Later").onClick(() => { // Change button text for proactive mode
          this.submitForm(true); // Call submitForm, indicating this IS a deferred log
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  // --- REFINED: Unified Submit Function (L45, L15) ---
  private submitForm(isDeferred: boolean) {
    if (isDeferred) {
      // --- Handle "Log Later" Logic (Same as before, but potentially pre-fill more fields in proactive mode) ---
      // Basic validation for essential context data (source task is critical)
      if (!this.sourceTask.trim()) {
        new Notice("Cannot defer without a source task.");
        return;
      }

      // Prepare an object containing the initial context captured so far
      // This matches the PendingLossLogContext interface defined in LossLogService
      // --- INCLUDE PROACTIVE MODE INDICATION (L15) and NEW FIELD (L45) ---
      const pendingItem: PendingLossLogContext = {
        sourceTask: this.sourceTask.trim(),
        // Store other relevant initial context data captured *during this modal session*
        initialFailureType: this.failureType || undefined, // Store if selected
        initialArchetypes: [...this.selectedArchetypes], // Store a copy of selected archetypes
        initialAura: this.aura, // Store the selected aura
        initialSyllabusTopics: this.syllabusTopics ? this.syllabusTopics.split(",").map(t => t.trim()).filter(t => t) : undefined, // Store topics if filled
        // Include the sourceTaskId from the initial context if it was provided (L51, L85)
        originalTaskId: this.initialContext?.sourceTaskId, // Pass the Crucible task ID or file path
        timestamp: new Date().toISOString(), // Record when it was deferred
        // --- ADD PROACTIVE MODE FLAG (L15) ---
        isProactive: this.initialContext?.isProactiveMode, // Indicate if this was deferred from proactive mode
        // --- END ADD ---
        // --- ADD TIME-TO-FAILURE POINT (L45) ---
        failureRealizationPoint: this.failureRealizationPoint, // Store the realization point if entered
        // --- END ADD ---
      };
      // --- END INCLUDE PROACTIVE MODE INDICATION AND NEW FIELD DATA ---

      // Add the item to the service's pending queue
      this.lossLogService.addPendingLog(pendingItem);
      new Notice("Labyrinth: Failure/Risk logged for later reflection in the Mythos Hub.");
      // --- NEW: Show Escape Mechanic Notice (L25) ---
      this.lossLogService.showEscapeMechanicNotice();
      // --- END NEW ---
      this.close(); // Close the modal after deferring
    } else {
      // --- Handle "Log Failure/Risk" Logic (Updated for Proactive Mode - L15, New Field - L45) ---
      // Basic validation (as before)
      if (!this.failureType) {
        new Notice("Please select a Failure Type.");
        return;
      }
      if (this.selectedArchetypes.length === 0) {
        new Notice("Please select at least one Failure Archetype.");
        return;
      }
      if (!this.sourceTask.trim()) {
        new Notice("Please enter the Source Task.");
        return;
      }
      if (!this.ariadnesThread.trim()) {
        new Notice("Please define an Ariadne's Thread (or Mitigation Principle).");
        return;
      }

      // Process comma-separated strings into arrays
      const topicsArray = this.syllabusTopics
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const papersArray = this.syllabusPapers
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // Prepare the data object
      const lossData: LossLogData = {
        lossId: "", // Will be generated by the service
        sourceTask: this.sourceTask.trim(),
        failureType: this.failureType,
        failureArchetypes: this.selectedArchetypes,
        impact: this.impact,
        syllabusTopics: topicsArray,
        syllabusPapers: papersArray,
        aura: this.aura,
        emotionalState: this.emotionalState || undefined,
        rootCauseChain: this.rootCauseChain.filter((c) => c.trim() !== ""), // Remove empty causes
        ariadnesThread: this.ariadnesThread.trim(),
        counterFactual: this.counterFactual.trim() || undefined,
        evidenceLink: this.evidenceLink.trim() || undefined,
        linkedMockTest: this.linkedMockTest.trim() || undefined,
        timestamp: new Date().toISOString(), // Set current time
        // --- INCLUDE PROVENANCE AND NEW FIELDS (L51, L15, L45) ---
        provenance: {
          origin: this.initialContext?.isProactiveMode ? "scrying-pool" : "manual", // Mark as scrying pool log if proactive
          // Include the sourceTaskId from the initial context if it was provided (L51, L85)
          sourceTaskId: this.initialContext?.sourceTaskId, // Pass the Crucible task ID or file path
        },
        // --- END INCLUDE PROVENANCE ---
        // --- ADD NEW FIELD DATA (L45) ---
        failureRealizationPoint: this.failureRealizationPoint || undefined, // Store the realization point if entered
        // --- END ADD NEW FIELD DATA ---
      };

      // Call the service to create the log
      try {
        // Use the service's helper to prepare the data (fills ID, defaults)
        const preparedData = this.lossLogService.prepareLossLogData(lossData);
        // Pass the prepared data to the service's creation method
        this.lossLogService.createLossLog(preparedData).then(() => {
          // Optionally call the onSubmit callback if you need to update parent state
          if (this.onSubmit) {
              this.onSubmit(preparedData);
          }
          new Notice(`Labyrinth: ${this.isProactiveMode ? "Risk" : "Failure"} logged successfully.`);
                    // --- NEW: Show Escape Mechanic Notice (L25) ---
          this.lossLogService.showEscapeMechanicNotice();
          // --- END NEW ---
          this.close(); // Close the modal on success
        }).catch((error) => {
          console.error("Failed to submit loss log:", error);
          new Notice("Failed to save loss log. Please check console.");
        });
      } catch (error) {
        console.error("Error preparing or creating loss log:", error);
        new Notice("An error occurred while preparing the log. Please check console.");
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}