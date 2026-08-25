// Hours Back — duplicate catching. A relisted business arrives under a fresh
// placeId; phone and website are the identities that survive relisting, so
// the gate compares all three and a match on ANY ONE is enough to skip.
//
// A place with neither phone nor website has no reliable key at all, so it
// routes to a name-plus-address comparison and is flagged NEEDS_REVIEW either
// way — the operator confirms it before it is worked, never silently trusted.

// A Places phone in any punctuation, spacing or country-code form reduces to
// its ten digits. Anything that does not yield exactly ten digits returns
// null — a malformed number must never become a match key.
function normalizePhone(value) {
  if (!value) return null;
  let d = String(value).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : null;
}

// A website URL in any scheme, subdomain, path or query dress reduces to its
// registrable host, lower-cased. No host, no key.
function normalizeDomain(value) {
  if (!value) return null;
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#]/)[0];
  return s || null;
}

// Casing, punctuation and spacing differences must not hide a collision.
function normalizeNameAddress(name, address) {
  const squash = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${squash(name)}|${squash(address)}`;
}

// The prospect row this place collides with, or null. Scans EVERY stored row
// regardless of stage — worked and doNotContact rows included, because a
// suppressed business must never re-enter through a re-listing. matchSignal
// names which normalized key produced the match.
async function findDuplicate(db, place) {
  const phone = normalizePhone(place.phone);
  const domain = normalizeDomain(place.website);
  const or = [{ placeId: place.placeId }];
  if (phone) or.push({ normalizedPhone: phone });
  if (domain) or.push({ normalizedDomain: domain });
  const hit = await db.prospect.findFirst({ where: { OR: or } });
  if (!hit) return null;
  const matchSignal = hit.placeId === place.placeId ? 'placeId'
    : (phone && hit.normalizedPhone === phone ? 'normalizedPhone' : 'normalizedDomain');
  return { prospect: hit, matchSignal };
}

// Record the collision instead of inserting — keptProspectId names the row
// that stays, matchSignal names which identity matched.
async function recordDuplicate(db, keptProspectId, place, matchSignal) {
  return db.prospectDuplicate.create({
    data: {
      keptProspectId,
      candidatePlaceId: place.placeId || null,
      candidateName: place.name || null,
      matchSignal,
    },
  });
}

// The whole gate decision for one place:
//   { action: 'skip',   matchSignal, keptProspectId }  collision recorded, no row
//   { action: 'insert', stage }                        genuinely new; stage is
//     NEEDS_REVIEW when the place had no key to match on, NO_CONTACT otherwise.
async function gateForPlace(db, place) {
  const phone = normalizePhone(place.phone);
  const domain = normalizeDomain(place.website);

  if (!phone && !domain) {
    // no reliable key — name-plus-address comparison, flagged either way
    const wanted = normalizeNameAddress(place.name, place.address);
    const candidates = await db.prospect.findMany({ select: { id: true, name: true, address: true } });
    const hit = candidates.find((c) => normalizeNameAddress(c.name, c.address) === wanted);
    if (hit) {
      await recordDuplicate(db, hit.id, place, 'name_address');
      return { action: 'skip', matchSignal: 'name_address', keptProspectId: hit.id };
    }
    return { action: 'insert', stage: 'NEEDS_REVIEW' };
  }

  const dup = await findDuplicate(db, place);
  if (dup) {
    await recordDuplicate(db, dup.prospect.id, place, dup.matchSignal);
    return { action: 'skip', matchSignal: dup.matchSignal, keptProspectId: dup.prospect.id };
  }
  return { action: 'insert', stage: 'NO_CONTACT' };
}

exports.normalizePhone = normalizePhone;
exports.normalizeDomain = normalizeDomain;
exports.normalizeNameAddress = normalizeNameAddress;
exports.findDuplicate = findDuplicate;
exports.recordDuplicate = recordDuplicate;
exports.gateForPlace = gateForPlace;
