/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentMessageRead } from './AgentMessageRead';
import type { AgentQuestionCardRead } from './AgentQuestionCardRead';
export type AgentTurnRead = {
    revision: number;
    stage: string;
    assistant_message: AgentMessageRead;
    question_card?: (AgentQuestionCardRead | null);
    actions?: Array<Record<string, any>>;
    workspace_patch?: Record<string, any>;
};

