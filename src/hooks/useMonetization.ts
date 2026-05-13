
import { useState, useCallback, useMemo } from 'react';
import { Device } from '@capacitor/device';
import { supabase } from '../supabaseClient';
import { Profile, SubscriptionTier } from '../types';
import { useQueryClient } from '@tanstack/react-query';

export function useMonetization(profile: Profile | null | undefined) {
  const queryClient = useQueryClient();
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState<boolean | null>(null);

  const currentTier = useMemo((): SubscriptionTier => {
    if (!profile) return SubscriptionTier.FREE;

    if (profile.subscription_tier === SubscriptionTier.PREMIUM) {
      if (profile.subscription_expires_at) {
        const expiry = new Date(profile.subscription_expires_at).getTime();
        if (expiry > Date.now()) return SubscriptionTier.PREMIUM;
      } else {
        return SubscriptionTier.PREMIUM;
      }
    }

    const trialStart = new Date(profile.trial_started_at).getTime();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() < trialStart + sevenDaysInMs) {
      return SubscriptionTier.TRIAL;
    }

    return SubscriptionTier.FREE;
  }, [profile]);

  const isPremium = currentTier === SubscriptionTier.PREMIUM || currentTier === SubscriptionTier.TRIAL;

  const verifyDevice = useCallback(async () => {
    if (!profile) return;

    try {
      const info = await Device.getId();
      const currentDeviceId = info.identifier;

      if (!profile.device_id) {
        const { error } = await supabase
          .from('profiles')
          .update({ device_id: currentDeviceId })
          .eq('id', profile.id);

        if (!error) {
          queryClient.invalidateQueries({ queryKey: ['profile', profile.id] });
          setIsDeviceAuthorized(true);
        }
      } else if (profile.device_id === currentDeviceId) {
        setIsDeviceAuthorized(true);
      } else {
        setIsDeviceAuthorized(false);
      }
    } catch (err) {
      console.error('Error verifying device:', err);
      setIsDeviceAuthorized(true);
    }
  }, [profile, queryClient]);

  const resetDevice = useCallback(async () => {
    if (!profile) return;
    try {
      const info = await Device.getId();
      const currentDeviceId = info.identifier;
      
      const { error } = await supabase
        .from('profiles')
        .update({ device_id: currentDeviceId })
        .eq('id', profile.id);

      if (!error) {
        queryClient.invalidateQueries({ queryKey: ['profile', profile.id] });
        setIsDeviceAuthorized(true);
      }
    } catch (err) {
      console.error('Error resetting device:', err);
    }
  }, [profile, queryClient]);

  const incrementSearchCount = async () => {
    if (!profile || isPremium) return true;

    const today = new Date().toISOString().split('T')[0];
    let newCount = profile.daily_search_count;

    if (profile.last_search_reset !== today) {
      newCount = 1;
    } else {
      if (newCount >= 5) return false;
      newCount += 1;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ 
        daily_search_count: newCount,
        last_search_reset: today 
      })
      .eq('id', profile.id);

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['profile', profile.id] });
    }
    
    return true;
  };

  return {
    currentTier,
    isPremium,
    isDeviceAuthorized,
    verifyDevice,
    resetDevice,
    incrementSearchCount,
    searchRemaining: isPremium ? Infinity : Math.max(0, 5 - (profile?.daily_search_count || 0))
  };
}
