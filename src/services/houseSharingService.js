import { getStoredCloudSessionSummary, isCloudBackupConfigured, supabaseRestFetch } from "./cloudBackupService.js";

export function isHouseSharingSetupMissing(message = "") {
  return /gh_house_|schema cache|function .*not found|could not find the function/i.test(String(message || ""));
}

function normaliseRpcRows(body) {
  return Array.isArray(body) ? body : [];
}

function safeHouseSnapshot(appData, house) {
  return {
    house,
    people: (appData.housePeople || []).filter(item => item.houseId === house.id),
    contributions: (appData.houseContributions || []).filter(item => item.houseId === house.id).map(item => ({
      ...item,
      linkedTransactionId: item.linkedTransactionId || null
    })),
    ownershipSplits: (appData.houseOwnershipSplits || []).filter(item => item.houseId === house.id)
  };
}

export async function listSharedHouseBundles(settings = {}) {
  if (!isCloudBackupConfigured(settings) || !getStoredCloudSessionSummary(settings).signedIn) return [];
  const rows = await supabaseRestFetch(settings, "rpc/gh_house_list_accessible", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return normaliseRpcRows(rows);
}

export async function upsertSharedHouseSnapshot(settings = {}, appData = {}, house) {
  const snapshot = safeHouseSnapshot(appData, house);
  const rows = await supabaseRestFetch(settings, "rpc/gh_house_upsert_snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_house_id: house.id,
      p_house: snapshot.house,
      p_people: snapshot.people,
      p_contributions: snapshot.contributions,
      p_ownership_splits: snapshot.ownershipSplits
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function addSharedHouseContribution(settings = {}, houseId, contribution) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_house_add_contribution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_house_id: houseId,
      p_contribution: contribution
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function inviteHouseMember(settings = {}, houseId, identifier, role) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_invite_house_member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_house_id: houseId,
      p_identifier: identifier,
      p_role: role
    })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function acceptHouseInvite(settings = {}, inviteId) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_accept_house_invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_invite_id: inviteId })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function declineHouseInvite(settings = {}, inviteId) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_decline_house_invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_invite_id: inviteId })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateHouseMemberRole(settings = {}, houseId, userId, role) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_update_house_member_role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_house_id: houseId, p_user_id: userId, p_role: role })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function removeHouseMember(settings = {}, houseId, userId) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_remove_house_member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_house_id: houseId, p_user_id: userId })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function cancelHouseInvite(settings = {}, houseId, inviteId) {
  const rows = await supabaseRestFetch(settings, "rpc/gh_cancel_house_invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_house_id: houseId, p_invite_id: inviteId })
  });
  return Array.isArray(rows) ? rows[0] : rows;
}
