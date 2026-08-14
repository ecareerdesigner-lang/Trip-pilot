# UX review

What was found by walking the app as a person using it, rather than reading
the code.

## Fixed

**Settings was a placeholder.** It had been telling the traveler that account
details were coming "in Phase 22" since before authentication was built. It
now edits name, home city, currency and timezone — none of which are
cosmetic. Currency formats every price in the app, and home city fills in the
wizard's starting point, so being unable to change them after signing up was
a small trap.

**Settings now says what the app is connected to.** Six providers, each
marked live or sample, with the environment variable that would change it.
The eight covered cities are named. The difference between sample data and
live prices is the difference between a plan and a booking, and finding out
which one you are looking at should not require reading the source.

**The trip Overview tab claimed features were unbuilt.** It was the default
landing page for every trip and said the itinerary and map views were "next"
for several days after they shipped. It now answers what somebody arrives
asking: how much is scheduled, whether the days actually work, and how many
must-dos made it in.

**New trips ignored the currency setting.** `Trip.currency` defaulted to USD
and was never read from the traveler, so changing it in settings did nothing.
New trips now inherit it, and dashboard totals — which span trips — use it
too. Existing trips deliberately keep theirs.

## Deliberately left

**Reservations and Documents tabs are visible but disabled**, with a tooltip.
Hiding them would make the trip view look complete when it is not; a tab that
navigates nowhere would be worse. Keeping them visible and inert is the
honest option.

**Marker crowding on the map.** Stops in the same neighbourhood overlap at
low zoom and separate when you zoom in. Offsetting them would put markers
where the places are not, which is worse than a little crowding.

**Existing trips do not change currency.** Relabelling a $3,000 budget as
€3,000 is not a conversion; it misstates what was budgeted. A per-trip
currency setting, or real conversion at a stored rate, would be the honest
fix if this is ever needed.

## Open

**No way to delete a trip from the UI.** The API supports it; nothing calls
it. A trip made by mistake is permanent, which is a poor first experience.

**No way to change an email or password.** Sign-up sets them and nothing can
edit them afterwards.

**The wizard cannot be resumed.** Leaving halfway through loses everything
entered. Trips save as `DRAFT`, so the shape exists to fix it.

**Nothing explains what the app does before sign-in.** The sign-in page
assumes the visitor already knows.

**The dashboard shows sample trips before the first real one.** Deliberate —
an empty product teaches nothing — but the sample cards are not clickable for
a signed-in user, which is a dead end worth revisiting.
