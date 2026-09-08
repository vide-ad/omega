-- Amendment A1 in docs/ENGINE-RULES.md. Records whether a human asserted a set's RIR, so that a
-- client's pre-filled default can no longer be read as a report that the set was easy. Only an
-- observed RIR may justify adding load.
--
-- The default is 1 because that is what an absent value means everywhere else: a client that does
-- not know its value was a default is telling the truth as far as it knows, and importers and the
-- coach are unaffected.
ALTER TABLE set_logs ADD COLUMN rir_observed INTEGER NOT NULL DEFAULT 1;

-- Existing rows predate the field. A row holding a real recorded RIR is an observation, because at
-- the time it was written there was no such thing as an unchallenged default to distinguish it from.
-- Assuming otherwise would retroactively freeze progression on real training history.
UPDATE set_logs SET rir_observed = 1 WHERE rir IS NOT NULL;

-- A row with no RIR observed nothing, so say so rather than carrying a default that means nothing.
-- It changes no behaviour, since a null RIR is excluded from the effort mean either way.
UPDATE set_logs SET rir_observed = 0 WHERE rir IS NULL;

-- An AMRAP set was taken to failure, which is an observation whatever the client sent.
UPDATE set_logs SET rir_observed = 1 WHERE is_amrap = 1;
