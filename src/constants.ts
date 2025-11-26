// src/constants.ts

// View Types - Unique identifiers for our custom views
export const PHOENIX_VIEW_TYPE = "phoenix-nest-view";
export const ALCHEMIST_LOG_VIEW_TYPE = "alchemist-log-view";
export const MYTHOS_HUB_VIEW_TYPE = "mythos-hub-view";
export const MATRIX_VIEW_TYPE = "priority-matrix-view";
import { LoomTaskDetails } from './services/SynthesisService'; // Import the type


// Quadrant System
export const QUADRANT_IDS = ["forge", "pantheon", "messenger", "void", "crucible", "archive"];

export const DEFAULT_NAMES = {
  forge: "The Forge 🔥",
  pantheon: "The Pantheon 🏛️",
  messenger: "The Messenger 🌬️",
  void: "The Void 🌌",
  crucible: "The Crucible ✨",
  archive: "The Archive 🏆"
};

// --- ✅ NEW: Centralized Type Definitions for Tasks ---
export interface Task {
    id: string;
    text: string;
    created: number;
}

// --- ✅ FIX: Added 'export' to this interface ---
export interface CompletedTask extends Task {
    completed: number;
}

export const DEFAULT_COLORS = {
  forge: "#f87171",
  pantheon: "#38bdf8",
  messenger: "#a3e635",
  void: "#a78bfa",
  crucible: "#fde68a",
  archive: "#78716c"
};

// ✅ This interface is now included and exported correctly
export interface MythicMatrixSettings {
    quadrantNames: Record<string, string>;
    quadrantColors: Record<string, string>;
    tasks: any[];
    completedTasks: CompletedTask[];
    weeklyReset: boolean;
    feedbackLog: any[];
    enableRevision: boolean;
    phoenixIntervals: number[];
    alchemistPending: any[];
    lossLogPending: any[];
    alchemistLogFolder: string;
    synthesisNoteFolder: string;
    weaverPending: LoomTaskDetails[]; // <-- ADD THIS LINE
    enableLoomRituals: boolean;
    enableLabyrinth: boolean;
    lossLogFolder: string; // e.g., "40 Reflections/Labyrinth"
    failureArchetypes: string[]; // Configurable list
    currentMinotaur: string; // Current top archetype
    minotaurHistory: { date: string; archetype: string }[]; // Historical tracking
    enableKintsugiHighlight: boolean;
    enableLabyrinthSoundCues: boolean;
    enableAutoCorrelation: boolean;
    autoLogOnTaskDefer: boolean; // For L85
    enableSynthesis: boolean;
   loomDeferralCounts: Record<string, number>;   
  revisionPending: any[]; // Consider defining a specific type for pending revisions, e.g., { filePath: string; nextRevision: string; revisionLevel: number; }
 // --- ADD NEW SETTING FOR ARCHIVED THREADS (L90) ---
  archivedThreads: { thread: string; topicPath: string; archivedOn: string; reason: string }[];
  // --- END ADD ---
    loomDeferralThreshold: number; // Number of deferrals before L85 prompt appears (e.g., 2)
    labyrinthDecayFactor: number; // Factor for exponential decay in Minotaur calculation (e.g., 0.95 means 5% decay per day)
  answerRubricFolder: string; // Folder to watch for answer rubric notes (e.g., "60 Answers/")
// --- Labyrinth New Settings ---
    labyrinthXP: number; // Total XP earned from Labyrinth
    minotaurStreak: number; // Consecutive days without Minotaur failure
    lastMinotaurDate: string | null; // ISO date of last Minotaur failure
    enableLabyrinthSound: boolean; // Toggle for L96
    guardianTaskInterval: number; // Default interval for Guardian tasks
    timeCapsuleFolder: string; // Folder for weekly reports


  
}

// Event for UI updates
export const EVENT_LABYRINTH_XP_UPDATED = 'labyrinth:xp-updated';
export const EVENT_ACHIEVEMENT_UNLOCKED = 'labyrinth:achievement';

// Define the possible failure types as a type alias for strict typing
export type FailureType = 'Knowledge Gap' | 'Skill Gap' | 'Process Failure';
// Define the type for failure archetypes (string-based for flexibility, but could be a union if fixed)
export type FailureArchetype = string;

// --- Labyrinth of Loss ---
export interface LossLogData {
  lossId: string; // Unique ID (e.g., loss_YYYYMMDD_HHMM)
  sourceTask: string; // Original task text that led to failure
  failureType: 'Knowledge Gap' | 'Skill Gap' | 'Process Failure';
  failureArchetypes: string[]; // e.g., ['conceptual-error', 'time-mismanagement']
  impact: number; // 1 = Minor, 5 = Critical (affects marks/strategy)
  syllabusTopics: string[]; // Linked topic notes: ["[[A]]", "[[B]]"]
  syllabusPapers: string[]; // UPSC papers: ["#gs2", "#essay"]
  aura: string; // Energy state: "#aura-high", "#aura-mid", "#aura-low"
  emotionalState?: string; // Optional: "Frustrated", "Anxious", "Tired"
  rootCauseChain: string[]; // 1–5 "Why?" answers
  ariadnesThread: string; // Reusable principle to prevent recurrence
  counterFactual?: string; // “What single action would’ve prevented this?”
  evidenceLink?: string; // Path to image/file (embedded in body)
  linkedMockTest?: string; // e.g., "[[Mock Test 5]]"
  timestamp: string; // ISO 8601 string
  provenance: {
    origin: "manual" | "deferred" | "auto" | "quick-log" | "scrying-pool" | "scrying-pool-quick"; // Add "scrying-pool-quick"
    sourceTaskId?: string; // Optional ID of the original task (e.g., Crucible task ID)
    // ... potentially other provenance fields like timestamp of origin, aura at origin, etc.
  };
  // --- ADD NEW FIELD: failureTags (L51, L98) ---
  failureTags?: string[]; // Optional array of tags like ["#failed-on-YYYYMMDD"]
  // --- END ADD ---
  failureRealizationPoint?: string; // e.g., "50%", "Near the end", "At the start"

}

// EventBus Events for Labyrinth
export const EVENT_LOSS_LOGGED = 'lossLogged';
export const EVENT_TASK_DEFERRED = 'taskDeferred'; // For L85
export const EVENT_WEEKLY_RESET = 'weeklyReset'; // For queue cleanup
export const EVENT_MINOTAUR_UPDATED = 'minotaurUpdated'; // Add this line


// Default failure archetypes
export const DEFAULT_FAILURE_ARCHETYPES = [
  'silly-mistake',
  'conceptual-error',
  'time-mismanagement',
  'overthinking',
  'source-deficit',
  'procrastination',
  'distraction',
  'faded-knowledge',
  'test-anxiety',
  'poor-structure'
];

// --- L12: Theseus Protocol Drill Library ---
export const THESEUS_DRILLS: Record<string, string[]> = {
    'time-mismanagement': [
        "⏱️ Theseus Drill: Solve 10 MCQs in strictly 7 minutes.",
        "⏱️ Theseus Drill: Write a Mains Answer Intro + Conclusion in 4 minutes.",
        "⏱️ Theseus Drill: Simulate the last 10 minutes of an exam (rush mode) with 5 questions."
    ],
    'conceptual-error': [
        "🧠 Theseus Drill: Feynman Technique - Explain the confused concept to a 5-year-old (out loud).",
        "🧠 Theseus Drill: Draw a concept map linking the weak topic to 3 other syllabus areas.",
        "🧠 Theseus Drill: Review standard text (NCERT/Laxmikanth) for the specific concept."
    ],
    'silly-mistake': [
        "🧐 Theseus Drill: 'Sniper Mode' - Solve 5 MCQs, reading every option twice before marking.",
        "🧐 Theseus Drill: Audit last mock test specifically for reading errors (not knowledge gaps).",
        "🧐 Theseus Drill: Practice 'keyword circling' on 5 Mains questions."
    ],
    'source-deficit': [
        "📚 Theseus Drill: Find and tag one primary source (Gov report/Standard Book) for this topic.",
        "📚 Theseus Drill: Cross-reference your notes against a topper's copy for this specific topic.",
        "📚 Theseus Drill: Value of Information (VOI) Check - Is this source yielding marks?"
    ],
    'overthinking': [
        "⚡ Theseus Drill: 'Gut Instinct' Run - Solve 10 MCQs trusting your first read immediately.",
        "⚡ Theseus Drill: Rapid Fire - Answer 5 questions with only 10 seconds of thought each."
    ],
    'procrastination': [
        "🧱 Theseus Drill: The 5-Minute Entry - Do just the first 5 minutes of the feared task.",
        "🧱 Theseus Drill: Break the blocked task into 3 microscopic sub-tasks."
    ],
    // Fallback for others
    'default': [
        "⚔️ Theseus Drill: Re-attempt the failed question/task immediately.",
        "⚔️ Theseus Drill: Write the Ariadne's Thread for this failure 3 times."
    ]
};

// Default Settings for the plugin
export const DEFAULT_SETTINGS: MythicMatrixSettings = {
  quadrantNames: { ...DEFAULT_NAMES },
  quadrantColors: { ...DEFAULT_COLORS },
  tasks: [],
  completedTasks: [],
  weeklyReset: false,
  feedbackLog: [],
  enableRevision: true,
  phoenixIntervals: [1, 3, 7, 14, 21, 30],
  alchemistPending: [],
  weaverPending: [],
  lossLogPending: [],
  alchemistLogFolder: "40 Reflections/Alchemist",
  synthesisNoteFolder: "50 Synthesis", // ← ADD THIS
  enableLoomRituals: false,
    enableLabyrinth: false, // Default off until ready
  lossLogFolder: "40 Reflections/Labyrinth",
  failureArchetypes: DEFAULT_FAILURE_ARCHETYPES,
  currentMinotaur: "",
  minotaurHistory: [],
  enableKintsugiHighlight: true,
  enableLabyrinthSoundCues: false,
  enableAutoCorrelation: true,
  autoLogOnTaskDefer: false,
  enableSynthesis: true, // Or false, depending on your default preference
  loomDeferralCounts: {}, // Initialize as an empty object
  revisionPending: [],  // Default value for revision pending queue
  archivedThreads: [], // Initialize as an empty array
  loomDeferralThreshold: 2, // Default threshold for L85 prompt
  labyrinthDecayFactor: 0.95, // Default decay factor for Labyrinth Minotaur calculation
  answerRubricFolder: "60 Answers/", // Default folder for answer rubric notes
 labyrinthXP: 0,
  minotaurStreak: 0,
  lastMinotaurDate: null,
  enableLabyrinthSound: true,
  guardianTaskInterval: 7, // Weekly by default
  timeCapsuleFolder: "00 Meta/Time Capsules",


};

