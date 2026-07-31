/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AgentTurnInputRead } from './AgentTurnInputRead';
export type AgentTurnRequest = {
    session_id: string;
    expected_revision: number;
    idempotency_key: string;
    input: AgentTurnInputRead;
};

