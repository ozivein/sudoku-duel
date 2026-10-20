import React from 'react';
import { PowerId } from '../types/game';
import { Zap, Shield, Search, Flame, Crown, Snowflake, Shuffle } from 'lucide-react';

interface PowerIconProps {
  powerId: PowerId;
  size?: number;
  className?: string;
}

export const PowerIcon: React.FC<PowerIconProps> = ({ powerId, size = 18, className = '' }) => {
  switch (powerId) {
    case 'speed_burst':
      return <Zap size={size} className={className} />;
    case 'error_shield':
      return <Shield size={size} className={className} />;
    case 'detective':
      return <Search size={size} className={className} />;
    case 'combo_saver':
      return <Flame size={size} className={className} />;
    case 'region_hunter':
      return <Crown size={size} className={className} />;
    case 'ice_strike':
      return <Snowflake size={size} className={className} />;
    case 'board_scramble':
      return <Shuffle size={size} className={className} />;
  }
};
