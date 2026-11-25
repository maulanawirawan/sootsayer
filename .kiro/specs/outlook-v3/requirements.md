# Outlook v3: haze-day chance and plain words for every reader

## Why
The judges and the first readers outside public health asked two things:
1. "How sure is the forecast?" The October 2026 forecast check showed that one
   day ahead the raw CAMS forecast caught 75% of Kalimantan's district haze
   days but only 49% of Sumatra's. A Dinkes officer needs a chance she can act
   on, like a rain chance, not a yes/no that misses half the haze in Sumatra.
2. "What does this screen mean?" A puskesmas head, a journalist and an
   epidemiologist all have to understand the first screen without help.

A feasibility run (purged leave-one-week-out, October 2026) showed that a
logistic regression per lead day on two inputs catches more haze days than the
raw rule and gives calibrated chances (when it said about 70%, haze came about
69% of the time in Kalimantan, 66% in Sumatra).

## Glossary
- **Chance model**: one logistic regression per lead day (model output
  statistics, MOS) that turns the morning forecast into a haze-day chance.
- **Lead day**: 0 = the first window day (the morning the forecast is read),
  1 = the next day, up to 4.
- **Alert threshold**: the chance at which the app and the briefing raise a
  watch: 0.5 ("more likely than not"), in `engine/src/method.rs`.
- **Fold model**: a chance model trained without one issue week and without
  any day that week's targets touch (purged).

## Requirement 1: haze-day chance in the outlook
**User story:** As a Dinkes officer, I want a chance of a haze day for each
district and day, so that I can prepare where haze is likely even when the raw
forecast stays just under the threshold.

1. WHEN the outlook input carries a chance model, THE engine SHALL give every
   window day of every district a haze-day chance between 0 and 1, rounded to
   0.001.
2. IF the forecast district PM10 of a window day or the district PM10 of the
   day before the window is unknown, THEN THE engine SHALL leave that day's
   chance empty and SHALL NOT guess it.
3. THE engine SHALL compute the chance with IEEE basic operations only, so the
   WebAssembly module and the native CLI return identical bytes.
4. IF a chance model has an empty id, no coefficients, more than 16 lead days,
   or a non-finite coefficient, THEN THE engine SHALL reject the input with an
   error that names the problem.
5. THE engine SHALL report the highest window chance and its date per district
   and in the priority list, and the model id in the output.
6. THE chance SHALL NOT change the haze-day classification, the durations, the
   relative risks or the ranking, which stay the study's method.

## Requirement 2: training and an honest test
**User story:** As a reviewer, I want to see how the chance was made and how
well it did on days it never saw, so that I can judge whether to trust it.

1. THE pipeline SHALL train the chance model with scikit-learn on the October
   2026 forecast replay: inputs ln(forecast district PM10) and ln(district
   PM10 of the day before the window), both floored at 1 µg/m³; target the
   hindsight haze day.
2. THE pipeline SHALL train one fold model per issue week (1-7, 8-14, 15-21,
   22-31 Oct), leaving out that week's pairs and every training pair whose
   target day or input day falls on a day that week's targets cover.
3. THE engine SHALL compute the test table from held-out chances: per lead
   day the hits, misses and false alarms at the alert threshold, the Brier
   score of the chance and of the raw rule, and reliability in five bins.
4. THE parity check SHALL find the WebAssembly module, the native CLI and the
   table the pipeline stored identical.
5. IF the engine's chance and scikit-learn's probability differ by more than
   0.0006 for any training pair, THEN THE pipeline SHALL stop without writing
   the model.
6. WHILE the replay shows "What was forecast", THE app SHALL use the fold
   model that did not see that week; in live mode it SHALL use the model
   trained on all of October and say that it is applied by analogy.
7. WHILE the replay shows "What happened" (hindsight), THE app SHALL show no
   chance.

## Requirement 3: the briefing
**User story:** As a Dinkes officer, I want the chance in the message I
forward, so that the group sees how sure the outlook is.

1. WHEN the outlook carries chances, THE briefing SHALL add the highest chance
   and its date to each ranked district line.
2. WHEN a complete district has no haze day by the forecast rule but a chance
   at or above the alert threshold, THE briefing SHALL list it under a watch
   heading with its highest chance and date.
3. WHEN the outlook carries chances, THE briefing SHALL name the model and its
   limit in the same language as the rest of the text.

## Requirement 4: plain words for every reader
**User story:** As someone who has never seen a haze model, I want the first
screen and each panel to tell me in one sentence what it means, so that I can
use the app without training.

1. WHEN the app opens, THE app SHALL show a start card with three plain steps
   and buttons to start, to take the tour, and to read how the map works.
2. THE district panel SHALL open with one plain sentence: the haze days in the
   window and the expected change in respiratory visits with its 95% range,
   or that visits are expected as usual.
3. THE puskesmas panel SHALL open with one plain sentence: the usual daily
   visits and the expected visits on the selected day with the 95% range.
4. THE plain sentences SHALL use only numbers the engine produced, in Bahasa
   Indonesia and English.
5. WHEN the outlook carries chances, THE priority panel SHALL list the
   districts without forecast haze days whose chance reaches the alert
   threshold, under a watch line.
6. THE app SHALL show next to every chance where it comes from and its limit:
   trained on October 2026, tested on weeks it did not see, compared with the
   model's own later estimate, not stations.
