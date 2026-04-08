import {
  UtensilsCrossed, Car, Gamepad2, Heart, Zap, Home,
  GraduationCap, ShoppingBag, CreditCard, MoreHorizontal,
  Briefcase, Laptop, TrendingUp, Gift, Plus,
  Wallet, Building2, PiggyBank, ArrowDownLeft,
  ArrowUpRight, ArrowLeftRight, DollarSign,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  UtensilsCrossed,
  Car,
  Gamepad2,
  Heart,
  Zap,
  Home,
  GraduationCap,
  ShoppingBag,
  CreditCard,
  MoreHorizontal,
  Briefcase,
  Laptop,
  TrendingUp,
  Gift,
  Plus,
  Wallet,
  Building2,
  PiggyBank,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  DollarSign,
};

export function getIcon(name: string): LucideIcon {
  return iconMap[name] || DollarSign;
}

export { type LucideIcon };
