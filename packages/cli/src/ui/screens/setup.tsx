import { ProgressBar, Spinner } from "@inkjs/ui";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type { PortCheckResult } from "../../lib/prerequisites.js";
import { SETUP_STEPS, Shell } from "../components/Shell.js";
import { THEME_COLOR } from "../constants.js";
import type { CLIStore } from "../store.js";
import {
  AlternativeGroupSelectionStep,
  CommandsSummary,
  EnvConfigStep,
  EnvGroupConfigStep,
  EnvMethodSelectionStep,
  InfisicalSetupStep,
  SetupModeSelectionStep,
} from "./init.js";

export const SetupScreen: React.FC<{ store: CLIStore }> = ({ store }) => {
  const [state, setState] = useState(store.currentState);

  useEffect(() => {
    const update = () => setState({ ...store.currentState });
    store.on("change", update);
    return () => {
      store.off("change", update);
    };
  }, [store]);

  return (
    <Shell status={state.status} step={state.step} steps={SETUP_STEPS}>
      {state.step === "Detect Repo" && (
        <Box
          flexDirection="column"
          paddingX={2}
          borderStyle="round"
          borderColor={THEME_COLOR}
        >
          <Text bold>Detecting GAIA Repository</Text>
          <Box marginTop={1}>
            <Spinner label="Searching for repository..." />
          </Box>
          {state.data.repoPath && (
            <Box marginTop={1}>
              <Text color="green">Found: {state.data.repoPath}</Text>
            </Box>
          )}
        </Box>
      )}

      {state.step === "Prerequisites" && state.data.checks && (
        <Box
          flexDirection="column"
          borderStyle="round"
          paddingX={1}
          borderColor={THEME_COLOR}
        >
          <Text bold>System Checks</Text>
          <Box flexDirection="column" marginTop={1}>
            <CheckItem label="Git" status={state.data.checks.git} />
            <CheckItem label="Docker" status={state.data.checks.docker} />
            <CheckItem label="Mise" status={state.data.checks.mise} />
          </Box>
        </Box>
      )}

      {state.inputRequest?.id === "port_conflicts" &&
        state.data.portConflicts && (
          <PortConflictStep
            portResults={state.data.portConflicts}
            onAccept={() => store.submitInput("accept")}
            onAbort={() => store.submitInput("abort")}
          />
        )}

      {state.inputRequest?.id === "setup_mode" && (
        <SetupModeSelectionStep onSelect={(mode) => store.submitInput(mode)} />
      )}

      {state.inputRequest?.id === "env_method" && (
        <EnvMethodSelectionStep
          onSelect={(method) => store.submitInput(method)}
        />
      )}

      {state.inputRequest?.id === "env_infisical" && (
        <InfisicalSetupStep onSubmit={(values) => store.submitInput(values)} />
      )}

      {state.step === "Environment Setup" &&
        state.inputRequest?.id === "env_var" &&
        state.data.currentEnvVar && (
          <EnvConfigStep
            categories={state.data.envCategories || []}
            currentVar={state.data.currentEnvVar}
            currentIndex={state.data.envVarIndex || 0}
            totalCount={state.data.envVarTotal || 0}
            onSubmit={(value) => store.submitInput(value)}
            onSkip={() => store.submitInput("")}
          />
        )}

      {state.step === "Environment Setup" &&
        state.inputRequest?.id === "env_group" &&
        state.data.currentEnvGroup && (
          <EnvGroupConfigStep
            category={state.data.currentEnvGroup}
            currentIndex={state.data.envGroupIndex || 0}
            totalGroups={state.data.envGroupTotal || 0}
            onSubmit={(values) => store.submitInput(values)}
          />
        )}

      {state.step === "Environment Setup" &&
        state.inputRequest?.id === "env_alternatives" &&
        state.data.alternativeGroups && (
          <AlternativeGroupSelectionStep
            alternatives={state.data.alternativeGroups}
            onSubmit={(selectedGroups, values) =>
              store.submitInput({ selectedGroups, values })
            }
          />
        )}

      {state.step === "Project Setup" && (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingX={1}
          borderStyle="round"
          borderColor={THEME_COLOR}
        >
          <Box marginBottom={1}>
            <Text bold color={THEME_COLOR}>
              Project Setup
            </Text>
          </Box>
          <Box flexDirection="column" gap={1}>
            <Box>
              {!state.data.dependencyComplete ? (
                <Spinner label={state.data.dependencyPhase || "Preparing..."} />
              ) : (
                <Text color="green">
                  {"\u2713"} {state.data.dependencyPhase}
                </Text>
              )}
            </Box>
            {!state.data.dependencyComplete &&
              state.data.dependencyProgress > 0 && (
                <Box width={50}>
                  <ProgressBar value={state.data.dependencyProgress} />
                </Box>
              )}
            {!state.data.dependencyComplete &&
              state.data.dependencyLogs?.length > 0 && (
                <Box
                  flexDirection="column"
                  marginTop={1}
                  borderStyle="single"
                  borderColor="gray"
                  paddingX={1}
                  minHeight={6}
                >
                  {state.data.dependencyLogs.map((log: string, i: number) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: logs are append-only
                    <Text key={i} color="gray" wrap="truncate">
                      {log}
                    </Text>
                  ))}
                </Box>
              )}
          </Box>
        </Box>
      )}

      {state.step === "Finished" && (
        <FinishedStep
          setupMode={state.data.setupMode}
          repoPath={state.data.repoPath}
          onConfirm={() => store.submitInput(true)}
        />
      )}

      {state.error && (
        <Box borderStyle="single" borderColor="red" padding={1} marginTop={2}>
          <Text color="red">Error: {state.error.message}</Text>
        </Box>
      )}
    </Shell>
  );
};

const CheckItem: React.FC<{
  label: string;
  status: "pending" | "success" | "error" | "missing";
}> = ({ label, status }) => (
  <Box>
    <Box marginRight={1}>
      {status === "pending" ? (
        <Spinner type="dots" />
      ) : status === "success" ? (
        <Text color={THEME_COLOR}>{"\u2714"}</Text>
      ) : status === "error" ? (
        <Text color="red">{"\u2716"}</Text>
      ) : (
        <Text color="yellow">{"\u26A0"}</Text>
      )}
    </Box>
    <Text>{label}</Text>
  </Box>
);

const PortConflictStep: React.FC<{
  portResults: PortCheckResult[];
  onAccept: () => void;
  onAbort: () => void;
}> = ({ portResults, onAccept, onAbort }) => {
  useInput((_input, key) => {
    if (key.return) onAccept();
    else if (key.escape) onAbort();
  });

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingX={1}
      borderStyle="round"
      borderColor="yellow"
    >
      <Text bold color="yellow">
        Port Conflicts Detected
      </Text>
      {portResults.map((result) => (
        <Box key={result.port}>
          <Text color={result.available ? "green" : "red"}>
            {result.available ? "\u2714" : "\u2716"}{" "}
          </Text>
          <Text>
            {result.service} (:{result.port})
          </Text>
          {!result.available && (
            <Text color="gray">
              {" "}
              - in use
              {result.usedBy ? ` by ${result.usedBy}` : ""}
              {result.alternative ? ` (alt: :${result.alternative})` : ""}
            </Text>
          )}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text>
          <Text color="green" bold>
            Enter
          </Text>
          {" continue  "}
          <Text color="yellow" bold>
            Escape
          </Text>
          {" abort"}
        </Text>
      </Box>
    </Box>
  );
};

const FinishedStep: React.FC<{
  setupMode?: string;
  repoPath?: string;
  onConfirm: () => void;
}> = ({ setupMode, repoPath, onConfirm }) => {
  useInput((_input, key) => {
    if (key.return) onConfirm();
  });

  const mode = setupMode || "developer";
  const dir = repoPath || ".";

  return (
    <Box
      flexDirection="column"
      marginTop={2}
      borderStyle="round"
      borderColor={THEME_COLOR}
      padding={1}
    >
      <Text color={THEME_COLOR} bold>
        Setup Complete!
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>To start GAIA, run:</Text>
        <Box
          marginTop={1}
          padding={1}
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
        >
          <Text color="cyan">$ cd {dir}</Text>
          <Text color="cyan">$ gaia start</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {mode === "selfhost"
              ? "Runs: docker compose --profile all up -d (background)"
              : "Runs: mise dev (interactive — keep terminal open)"}
          </Text>
        </Box>
      </Box>

      <CommandsSummary />
      <Box marginTop={1}>
        <Text dimColor>Press Enter to exit</Text>
      </Box>
    </Box>
  );
};
