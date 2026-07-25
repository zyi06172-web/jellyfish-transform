/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentMessageRead } from './AgentMessageRead';
import type { AgentQuestionCardRead } from './AgentQuestionCardRead';
export type AgentWorkspaceSnapshotRead = {
    project_id: string;
    session_id: string;
    stage: string;
    status: string;
    revision: number;
    confirmed_stages?: Array<string>;
    completed_stages?: Array<string>;
    question_card?: (AgentQuestionCardRead | null);
    messages?: Array<AgentMessageRead>;
    artifacts?: Record<string, any>;
};

