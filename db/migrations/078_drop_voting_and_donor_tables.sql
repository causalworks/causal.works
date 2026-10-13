-- Migration: Drop voting record and donor tracking tables
-- These tables were part of Phase 2 (voting record layer) and Phase 3 (rep donors)
-- Now being removed in favor of simpler turnaround-based rep matching

DROP TABLE IF EXISTS rep_votes_cache CASCADE;
DROP TABLE IF EXISTS rep_donors CASCADE;
DROP TABLE IF EXISTS bills_cache CASCADE;
