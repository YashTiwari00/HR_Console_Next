"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/src/lib/cn";
import { Badge, Button, Card, Input, Spinner, Textarea } from "@/src/components/ui";
import * as pmsClient from "@/app/employee/_lib/pmsClient";

export interface ConversationalGoalComposerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isTyping?: boolean;
}

export interface ConversationalGoalComposerSuggestion {
  id: string;
  title: string;
  description: string;
  weightage: number;
  cascadeHint?: string;
  accepted?: boolean;
}

export interface ConversationalGoalComposerProps {
  cycleId: string;
  frameworkType: string;
  className?: string;
  parentGoalId?: string;
  targetEmployeeId?: string;
  placeholder?: string;
  title?: string;
  description?: string;
  onAcceptGoal?: (goal: ConversationalGoalComposerSuggestion) => Promise<void>;
  onAcceptAll?: (goals: ConversationalGoalComposerSuggestion[]) => void;
}

interface EditingState {
  id: string;
  title: string;
  description: string;
  weightage: string;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toSuggestionItem(item: pmsClient.GoalSuggestion & { cascadeHint?: string }) {
  return {
    id: makeId(),
    title: item.title,
    description: item.description,
    weightage: Number(item.weightage) || 0,
    cascadeHint: item.cascadeHint,
    accepted: false,
  } as ConversationalGoalComposerSuggestion;
}

export default function ConversationalGoalComposer({
  cycleId,
  frameworkType,
  className,
  parentGoalId,
  targetEmployeeId,
  placeholder = "Describe what outcome you want this cycle...",
  title = "Conversational Goal Composer",
  description = "Chat with assistant to draft goals. Accept or edit suggestions before using them.",
  onAcceptGoal,
  onAcceptAll,
}: ConversationalGoalComposerProps) {
  const [messages, setMessages] = useState<ConversationalGoalComposerMessage[]>([]);
  const [suggestedGoals, setSuggestedGoals] = useState<ConversationalGoalComposerSuggestion[]>([]);
  const [prompt, setPrompt] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptSuccess, setAcceptSuccess] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [creatingByGoalId, setCreatingByGoalId] = useState<Record<string, boolean>>({});
  const [cardErrorByGoalId, setCardErrorByGoalId] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const canSubmit = useMemo(() => {
    return !loading && Boolean(prompt.trim()) && Boolean(cycleId.trim());
  }, [loading, prompt, cycleId]);

  const appendTurnWithTypingAssistant = (inputMessage: string) => {
    const now = new Date().toISOString();
    const assistantMessageId = makeId();

    setMessages((prev) => [
      ...prev,
      {
        id: makeId(),
        role: "user",
        content: inputMessage,
        createdAt: now,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: now,
        isTyping: true,
      },
    ]);

    return assistantMessageId;
  };

  const updateAssistantMessage = (assistantMessageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content,
              isTyping: false,
            }
          : message
      )
    );
  };

  const runSuggestion = async (inputMessage: string) => {
    if (!inputMessage.trim()) return;

    setLoading(true);
    setError("");
    setAcceptSuccess("");

    const activeConversationId = conversationId || makeId();
    if (!conversationId) {
      setConversationId(activeConversationId);
    }

    const assistantMessageId = appendTurnWithTypingAssistant(inputMessage);

    try {
      const response = await pmsClient.getConversationalGoalSuggestions({
        cycleId,
        frameworkType,
        message: inputMessage,
        conversationId: activeConversationId,
        parentGoalId,
        targetEmployeeId,
      });

      if (response?.conversation?.conversationId) {
        setConversationId(response.conversation.conversationId || activeConversationId);
      }

      updateAssistantMessage(
        assistantMessageId,
        response.assistantReply || "I generated suggestions. Review and accept or edit them."
      );

      const nextSuggestions = (response.suggestedGoals || []).map(toSuggestionItem);
      setSuggestedGoals(nextSuggestions);
      setCardErrorByGoalId({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate suggestions.";
      setError(message);
      updateAssistantMessage(
        assistantMessageId,
        "I could not generate suggestions right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;

    setPrompt("");
    await runSuggestion(nextPrompt);
  };

  const startEdit = (goal: ConversationalGoalComposerSuggestion) => {
    setEditing({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      weightage: String(goal.weightage),
    });
  };

  const saveEdit = () => {
    if (!editing) return;

    const parsedWeightage = Number.parseInt(editing.weightage, 10);

    setSuggestedGoals((prev) =>
      prev.map((goal) => {
        if (goal.id !== editing.id) return goal;

        return {
          ...goal,
          title: editing.title.trim() || goal.title,
          description: editing.description.trim() || goal.description,
          weightage: Number.isNaN(parsedWeightage) ? goal.weightage : parsedWeightage,
        };
      })
    );

    setEditing(null);
  };

  const acceptGoal = (goalId: string) => {
    const selected = suggestedGoals.find((goal) => goal.id === goalId);
    if (!selected) return;

    setCreatingByGoalId((prev) => ({ ...prev, [goalId]: true }));
    setCardErrorByGoalId((prev) => ({ ...prev, [goalId]: "" }));
    setAcceptSuccess("");

    const acceptedGoal = { ...selected, accepted: true };

    const run = async () => {
      try {
        if (onAcceptGoal) {
          await onAcceptGoal(acceptedGoal);
        } else {
          await pmsClient.createGoal({
            title: acceptedGoal.title,
            description: acceptedGoal.description,
            weightage: acceptedGoal.weightage,
            cycleId,
            frameworkType,
            managerId: "",
          });
        }

        setSuggestedGoals((prev) => prev.filter((goal) => goal.id !== goalId));
        setAcceptSuccess("Goal created successfully from AI suggestion.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create goal from suggestion.";
        setCardErrorByGoalId((prev) => ({ ...prev, [goalId]: message }));
      } finally {
        setCreatingByGoalId((prev) => ({ ...prev, [goalId]: false }));
      }
    };

    void run();
  };

  const acceptAllGoals = () => {
    setSuggestedGoals((prev) => {
      const acceptedGoals = prev.map((goal) => ({ ...goal, accepted: true }));

      if (onAcceptAll) {
        queueMicrotask(() => {
          onAcceptAll(acceptedGoals);
        });
      }

      return acceptedGoals;
    });
  };

  const regenerateGoal = async (goal: ConversationalGoalComposerSuggestion) => {
    const regeneratePrompt = `Regenerate this goal with improved clarity and measurability: ${goal.title}. Current description: ${goal.description}`;
    await runSuggestion(regeneratePrompt);
  };

  return (
    <Card
      title={title}
      description={description}
      className={cn("h-full", className)}
      footer={
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-2">
          <Textarea
            rows={2}
            placeholder={placeholder}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={loading}
          />
          <div className="flex items-center justify-between">
            <p className="caption text-[var(--color-text-muted)]">
              Use follow-up prompts to refine, for example: Make them more aggressive.
            </p>
            <Button type="submit" size="sm" disabled={!canSubmit} loading={loading}>
              Send
            </Button>
          </div>
        </form>
      }
    >
      <div className="flex h-full min-h-[420px] flex-col gap-4">
        <div
          ref={listRef}
          className="flex max-h-[260px] flex-col gap-2 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
        >
          {messages.length === 0 && (
            <p className="caption text-[var(--color-text-muted)]">
              Start a conversation to get smart goal suggestions.
            </p>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[90%] rounded-[var(--radius-sm)] px-3 py-2 body-sm whitespace-pre-wrap",
                message.role === "user"
                  ? "self-end bg-[var(--color-primary)] text-[var(--color-button-text)]"
                  : "self-start border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
              )}
            >
              {message.role === "assistant" && message.isTyping ? (
                <span className="inline-flex items-center gap-2 text-[var(--color-text-muted)]">
                  <Spinner size="sm" />
                  Assistant is typing...
                </span>
              ) : (
                message.content
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {error && (
            <p className="caption rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] px-3 py-2 text-[var(--color-danger)]">
              {error}
            </p>
          )}

          {acceptSuccess && (
            <p className="caption rounded-[var(--radius-sm)] border border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_8%,white)] px-3 py-2 text-[var(--color-success)]">
              {acceptSuccess}
            </p>
          )}

          {suggestedGoals.length > 0 && (
            <div className="flex items-center justify-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={acceptAllGoals}
                disabled={suggestedGoals.every((goal) => goal.accepted)}
              >
                Accept All
              </Button>
            </div>
          )}

          {suggestedGoals.map((goal) => {
            const isEditing = editing?.id === goal.id;
            const isCreating = Boolean(creatingByGoalId[goal.id]);
            const cardError = cardErrorByGoalId[goal.id];

            return (
              <div
                key={goal.id}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge variant={goal.accepted ? "success" : "default"}>
                    {goal.accepted ? "Accepted" : "Suggestion"}
                  </Badge>
                  <span className="caption">{goal.weightage}%</span>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <Textarea
                      rows={1}
                      value={editing.title}
                      onChange={(event) =>
                        setEditing((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                      }
                    />
                    <Textarea
                      rows={3}
                      value={editing.description}
                      onChange={(event) =>
                        setEditing((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                      }
                    />
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="w-full"
                      value={editing.weightage}
                      onChange={(event) =>
                        setEditing((prev) => (prev ? { ...prev, weightage: event.target.value } : prev))
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={saveEdit}
                        disabled={isCreating}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(null)}
                        disabled={isCreating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="body-sm font-medium text-[var(--color-text)]">{goal.title}</p>
                    <p className="caption text-[var(--color-text-muted)]">{goal.description}</p>
                    {goal.cascadeHint && <p className="caption">Cascade hint: {goal.cascadeHint}</p>}
                    <div className="mt-1 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => acceptGoal(goal.id)}
                        loading={isCreating}
                        disabled={isCreating}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => startEdit(goal)}
                        disabled={isCreating}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => regenerateGoal(goal)}
                        disabled={loading || isCreating}
                      >
                        Regenerate
                      </Button>
                    </div>

                    {cardError && (
                      <p className="caption rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_8%,white)] px-2 py-1 text-[var(--color-danger)]">
                        {cardError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
