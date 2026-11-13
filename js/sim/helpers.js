// What the helpers bought with credits do, as plain rules on the company: no drawing, no network.
// A helper does what the player can already do with a button, and nothing more: the Site Foreman presses "Send from the
// warehouse" on the building site, the Goal Clerk presses "Claim" on a finished goal. So a company with helpers earns
// exactly what it would if the player pressed those buttons at the same moments (tests/credits.test.mjs).
// Whether a helper is owned is the server's answer (js/credits.js); this file only asks `owns`.

const PERIODS = ['daily', 'weekly', 'event'];

/**
 * Once a second: let every owned helper do its job.
 * @param company  the Company (js/sim/company.js)
 * @param owns     (itemId) => boolean, true only while the server has said so in this visit
 * @returns what was done, for the game to show: [{ kind: 'send', result: goods } | { kind: 'goal', result: { cash, xp, bonus } }]
 */
export function helperChores(company, owns) {
  const done = [];
  if (owns('foreman') && company.siteOpen && company.site.at && company.siteSendable() > 0) {
    const sent = company.sendToSite();
    if (sent) done.push({ kind: 'send', result: sent });
  }
  if (owns('clerk')) {
    const got = { cash: 0, xp: 0, bonus: false };
    for (const period of PERIODS) {
      for (const g of company.goalList(period)) {
        if (!g.done || g.claimed) continue;
        const r = company.claimGoal(period, g.index);
        if (r) { got.cash += r.cash; got.xp += r.xp; got.bonus = got.bonus || r.bonus; }
      }
    }
    if (got.cash || got.xp) done.push({ kind: 'goal', result: got });
  }
  return done;
}
