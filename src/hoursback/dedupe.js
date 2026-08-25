// Hours Back — duplicate catching. A relisted business arrives under a fresh
// placeId; phone and website are the identities that survive relisting, so
// the gate compares all three and a match on ANY ONE is enough to skip.

// A Places phone in any formatting reduces to its ten digits.
function normalizePhone(value) {
  if (!value) return null;
  let d = String(value).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? d : (d || null);
}

// A website URL in any dress reduces to its registrable host.
function normalizeDomain(value) {
  if (!value) return null;
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#]/)[0];
  return s || null;
}

// The prospect row this place collides with, or null. Matches across EVERY
// stored row regardless of stage — worked and do-not-contact rows included,
// because a suppressed business must never re-enter through a re-listing.
async function findDuplicate(db, place) {
  const phone = normalizePhone(place.phone);
  const domain = normalizeDomain(place.website);
  const or = [{ placeId: place.placeId }];
  if (phone) or.push({ normalizedPhone: phone });
  if (domain) or.push({ normalizedDomain: domain });
  const hit = await db.prospect.findFirst({ where: { OR: or } });
  if (!hit) return null;
  const matchSignal = hit.placeId === place.placeId ? 'placeId'
    : (phone && hit.normalizedPhone === phone ? 'phone' : 'domain');
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

exports.normalizePhone = normalizePhone;
exports.normalizeDomain = normalizeDomain;
exports.findDuplicate = findDuplicate;
exports.recordDuplicate = recordDuplicate;
