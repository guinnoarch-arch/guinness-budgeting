import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../utils/errors.js";
import { acceptHouseInvite, cancelHouseInvite, declineHouseInvite, inviteHouseMember, isHouseSharingSetupMissing, listSharedHouseBundles, removeHouseMember, updateHouseMemberRole, upsertSharedHouseSnapshot } from "../services/houseSharingService.js";
import { buildSharedHouseData, mergeHouseDisplayData } from "../utils/houseMortgage.js";

// Houses shared through the cloud: loading them, inviting people, changing
// roles, and merging shared houses into what the Loans page displays.
export default function useHouseSharing({ appData }) {
  const [sharedBundles, setSharedBundles] = useState([]);

  const [sharingStatus, setSharingStatus] = useState("");

  const [sharingBusy, setSharingBusy] = useState("");

  async function refreshSharedHouses(statusMessage = "") {
    try {
      const bundles = await listSharedHouseBundles(appData.settings || {});
      setSharedBundles(bundles);
      setSharingStatus(statusMessage);
    } catch (error) {
      setSharedBundles([]);
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : getErrorMessage(error, "Couldn't load shared houses. Try again in a moment."));
    }
  }

  useEffect(() => {
    refreshSharedHouses();
  }, [appData.settings?.cloudBackup?.enabled, appData.settings?.cloudBackup?.cloudUserId, appData.settings?.cloudBackup?.lastSignedInAt]);

  const sharedHouseData = useMemo(() => buildSharedHouseData(sharedBundles), [sharedBundles]);

  const displayAppData = useMemo(() => mergeHouseDisplayData(appData, sharedHouseData), [appData, sharedHouseData]);

  async function publishHouseForSharing(house) {
    setSharingBusy("publish");
    try {
      await upsertSharedHouseSnapshot(appData.settings || {}, appData, house);
      await refreshSharedHouses("House sharing snapshot is up to date.");
    } catch (error) {
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : getErrorMessage(error, "Couldn't publish house for sharing. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function sendHouseInvite(house, identifier, role) {
    const trimmed = String(identifier || "").trim();
    if (!trimmed) {
      setSharingStatus("Enter an email address or username to invite.");
      return;
    }
    setSharingBusy("invite");
    try {
      await upsertSharedHouseSnapshot(appData.settings || {}, appData, house);
      await inviteHouseMember(appData.settings || {}, house.id, trimmed, role || "viewer");
      await refreshSharedHouses("House invite updated.");
    } catch (error) {
      setSharingStatus(isHouseSharingSetupMissing(error?.message)
        ? "House sharing SQL setup has not been run yet."
        : getErrorMessage(error, "Couldn't send house invite. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function acceptInvite(invite) {
    setSharingBusy(`accept-${invite.id}`);
    try {
      await acceptHouseInvite(appData.settings || {}, invite.id);
      await refreshSharedHouses("House invite accepted.");
    } catch (error) {
      setSharingStatus(getErrorMessage(error, "Couldn't accept house invite. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function declineInvite(invite) {
    setSharingBusy(`decline-${invite.id}`);
    try {
      await declineHouseInvite(appData.settings || {}, invite.id);
      await refreshSharedHouses("House invite declined.");
    } catch (error) {
      setSharingStatus(getErrorMessage(error, "Couldn't decline house invite. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function cancelInvite(house, invite) {
    setSharingBusy(`cancel-${invite.id}`);
    try {
      await cancelHouseInvite(appData.settings || {}, house.id, invite.id);
      await refreshSharedHouses("House invite cancelled.");
    } catch (error) {
      setSharingStatus(getErrorMessage(error, "Couldn't cancel house invite. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function changeMemberRole(house, member, role) {
    setSharingBusy(`role-${member.userId}`);
    try {
      await updateHouseMemberRole(appData.settings || {}, house.id, member.userId, role);
      await refreshSharedHouses("House member role updated.");
    } catch (error) {
      setSharingStatus(getErrorMessage(error, "Couldn't update member role. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  async function removeMember(house, member) {
    if (!window.confirm(`Remove ${member.username || member.email || "this user"} from this house?`)) return;
    setSharingBusy(`remove-${member.userId}`);
    try {
      await removeHouseMember(appData.settings || {}, house.id, member.userId);
      await refreshSharedHouses("House member removed.");
    } catch (error) {
      setSharingStatus(getErrorMessage(error, "Couldn't remove member. Try again in a moment."));
    } finally {
      setSharingBusy("");
    }
  }

  return {
    acceptInvite,
    cancelInvite,
    changeMemberRole,
    declineInvite,
    displayAppData,
    publishHouseForSharing,
    refreshSharedHouses,
    removeMember,
    sendHouseInvite,
    setSharingBusy,
    setSharingStatus,
    sharingBusy,
    sharingStatus
  };
}
