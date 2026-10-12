export interface GoldFactor {
  name: string;
  levels: string[];
  unit_role: "between_unit" | "within_unit";
}

export interface GoldAxis {
  name: string;
  unit: string;
  levels: Array<string | number>;
  sampling: "cross_sectional" | "longitudinal";
  identity_retained: boolean;
}

export interface GoldNestedLevel {
  level: string;
  parent: string | null;
  role: string;
}

export interface GoldCase {
  case_id: string;
  source: string;
  domain: string;
  title: string;
  experiment_description: string;
  true_experimental_unit: string;
  identities: string[];
  factors_conditions: GoldFactor[];
  condition_relationship: string;
  repeated_structure: string;
  nested_structure: GoldNestedLevel[];
  ordered_axes: GoldAxis[];
  natural_input_surface: {
    surface_id: string;
    row_semantics: string;
    column_semantics: string;
  };
  expected_internal_design: {
    measurements: Array<{ name: string; value_type: string; observation_level?: string; axis_names?: string[] }>;
  };
  architecture_a_current: {
    correct_structure_reachable: "yes" | "partial" | "no";
    input_load: string;
  };
}

export interface GoldSet {
  version: string;
  case_count: number;
  cases: GoldCase[];
}
