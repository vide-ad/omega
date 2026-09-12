# House style

David's rules, 8 September 2026. These apply to everything an agent writes for Omega. Chat replies, Slack posts,
documents, commit messages, PR bodies, and any text the app itself shows a user.

## Punctuation

Never use em dashes, semi-colons, inline dots, or arrows. Never use a vertical bar to join clauses in prose.
Use full stops, commas and brackets instead. If two clauses need joining, either join them with a conjunction or
make them two sentences.

Markdown tables are a grey area, because their pipes are structure rather than punctuation. Prefer a list. Use a
table only when the content is genuinely a grid, and never in a chat reply.

## No slogans

Delete any formulaic, buzzword-led fragment that sounds polished and says little. Examples of what to cut:
"small footprint, high pressure", "paper compliance is out", "fewer referees, more rulebooks". The test: if a
line would work on a conference banner, cut it.

This also rules out the shape where you state something, then add a short punchy sentence that restates it for
effect. Say the thing once.

## Active voice

Name who did the thing. "Wren ruled that lanes stay merged", not "it was ruled that lanes stay merged". "I got
the colour contrast wrong", not "the contrast was incorrect".

## Explain simply first

David describes himself as a vibe coder. He is intelligent and will follow the detail, but he should not have to
decode jargon to reach the point.

So lead with what a thing means in ordinary language, then go deeper for anyone who wants the mechanism. A
decision document should open with the question a person would actually ask, not with a spec reference. Put the
section numbers, the field names and the measurements underneath, where they support the plain reading rather
than replace it.

`docs/DECISIONS-FOR-DAVID.md` is the worked example.

## Tone. The app is kind.

David set this on 12 September 2026, describing how Omega should eventually speak alongside North:

> It's supposed to be a very kind app, so it won't tell you if you fucked up or anything like that. It
> should just reward you for your effort whether it was small, like making it, or large, like doing a
> really good workout.

This is not only a future concern. It binds the text the app already produces.

**Reward showing up.** Turning up and doing three poor sets is a win and the app should treat it as one.
The person who trains badly on a bad day is doing the thing that works over years.

**Never scold, never imply failure.** The engine has states that could easily read as judgement. Dropping
the load 10% after two sessions under the rep range, flagging three stalls, marking a session compromised.
Each is a fact about the numbers and none is a verdict on the person. Write them as what the app will do
next, not as what went wrong.

**No fake enthusiasm either.** Kind is not the same as cheerful. Do not congratulate a set, do not use
exclamation marks, do not invent praise the person can tell is automatic. State the thing plainly and
warmly, and let the record speak.

**A missed session is not a moral event.** The app has no streaks to break and nothing to guilt anyone
with. Gaps happen because of illness, work, injury and life.

## Scope

Anything a user reads counts, including error messages and the engine's own rationale strings. The rationale is
read by David between sets, so it follows these rules too.

Existing documents were written before these rules and still break them. Fix a document when you next touch it
for another reason. Do not open a pull request that only reformats punctuation.
