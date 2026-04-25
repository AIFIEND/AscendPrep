export type RoleplayMcqQuestion = {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type RoleplayTraining = {
  likely_performance_indicators?: string[];
  key_terms?: string[];
  opening_strategy?: {
    suggested_opening?: string;
    [key: string]: unknown;
  };
  likely_judge_questions?: string[];
  closing_tip?: string;
  objective_summary?: string;
  student_tasks?: string[];
  strong_response_includes?: string[];
  common_student_mistakes?: string[];
  mcq_training_questions?: unknown[];
  [key: string]: unknown;
};

export type Roleplay = {
  id: number;
  event: string;
  industry: string;
  business_name: string;
  student_role: string;
  judge_role: string;
  scenario_background: string;
  objective: string;
  task_type: string;
  difficulty: string;
  training: RoleplayTraining;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const ROLEPLAY_DRILL_OPTIONS = [
  { value: "determine_objective", label: "Determine the Objective" },
  { value: "identify_performance_indicators", label: "Identify Performance Indicators" },
  { value: "plan_opening", label: "Plan the Opening" },
  { value: "anticipate_judge_questions", label: "Anticipate Judge Questions" },
  { value: "define_key_terms", label: "Define Key Terms" },
  { value: "plan_closing", label: "Plan the Closing" },
] as const;

export const ROLEPLAY_DRILL_LABELS: Record<string, string> = Object.fromEntries(
  ROLEPLAY_DRILL_OPTIONS.map((option) => [option.value, option.label])
);
