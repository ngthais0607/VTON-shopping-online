"use client";
import { useState, useEffect, useRef } from "react";
import {
  ShoppingBag,
  ShoppingCart,
  Menu,
  X,
  Zap,
  LogIn,
  LayoutDashboard,
  LogOut,
  ClipboardList,
  ChevronDown,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { User } from "@/lib/types";

interface HeaderProps {
  currentUser?: User | null;
  onShopNow?: () => void;
  onLogout?: () => void;
}

export function Header({ currentUser, onShopNow, onLogout }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { totalCount, setIsCartOpen } = useCart();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogoutClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setUserDropdownOpen(false);
    if (onLogout) onLogout();
  };

  const handleShopNowClick = () => {
    if (onShopNow) {
      onShopNow();
    } else if (typeof window !== "undefined") {
      window.location.href = "/store";
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-xl border-b border-sky-100 shadow-[0_4px_25px_rgba(14,165,233,0.06)]"
          : "bg-gradient-to-b from-white/90 via-sky-50/30 to-transparent backdrop-blur-xs"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Logo */}
        <Link href="/store" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-cyan-600 flex items-center justify-center shadow-md shadow-sky-500/25 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
            <Zap className="w-5 h-5 text-white" fill="white" />
          </div>
          <div className="flex flex-col">
            <span
              className="text-slate-900 tracking-tight flex items-center gap-1"
              style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.25rem" }}
            >
              Luxe<span className="bg-gradient-to-r from-sky-600 via-cyan-600 to-blue-700 bg-clip-text text-transparent">Store</span>
              <Sparkles className="w-3.5 h-3.5 text-sky-500 animate-pulse inline" />
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-sky-700/70 -mt-1">Ocean Retail</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-sky-50/70 p-1.5 rounded-full border border-sky-200/60 backdrop-blur-md shadow-inner">
          <button
            onClick={handleShopNowClick}
            className="px-4 py-2 text-xs font-bold text-sky-950 hover:text-sky-700 hover:bg-white transition-all rounded-full cursor-pointer shadow-xs"
          >
            Products
          </button>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 transition-all rounded-full"
          >
            Features
          </a>
          <a
            href="#customer-love"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("customer-love")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 transition-all rounded-full"
          >
            Reviews
          </a>
          <Link
            href="/store/about"
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 transition-all rounded-full"
          >
            About Us
          </Link>
          <Link
            href="/store/contact"
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-white/80 transition-all rounded-full"
          >
            Support
          </Link>
        </nav>

        {/* Right Action Icons & User Controls */}
        <div className="flex items-center gap-3">
          {/* Cart Drawer Trigger */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2.5 rounded-full bg-white border border-sky-200/90 text-slate-700 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-all shadow-xs cursor-pointer group active:scale-95"
            title="Shopping Cart"
          >
            <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
            {totalCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-5 px-1.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-600 text-white text-[11px] font-extrabold flex items-center justify-center shadow-md shadow-sky-500/30 animate-bounce">
                {totalCount}
              </span>
            )}
          </button>

          {/* User Account / Profile Dropdown */}
          {currentUser ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 bg-white border border-sky-200/90 hover:border-sky-300 p-1.5 pl-3 rounded-full shadow-xs hover:shadow transition-all cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-cyan-600 text-white font-bold text-xs flex items-center justify-center shadow-inner">
                  {(currentUser.first_name || currentUser.username).charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline text-xs font-bold text-slate-800 max-w-[100px] truncate">
                  {currentUser.first_name || currentUser.username}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${userDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {/* User Dropdown Menu */}
              <AnimatePresence>
                {userDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl border border-sky-100 rounded-2xl shadow-2xl p-2 space-y-1 z-50 divide-y divide-slate-100"
                  >
                    <div className="px-3 py-2">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {currentUser.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}` : currentUser.username}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                    </div>

                    <div className="pt-1 space-y-0.5">
                      <Link
                        href="/store/account"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 rounded-xl hover:bg-sky-50 hover:text-sky-700 transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-sky-600" />
                        My Account
                      </Link>

                      <Link
                        href="/store/orders"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 rounded-xl hover:bg-sky-50 hover:text-sky-700 transition-colors"
                      >
                        <ClipboardList className="w-4 h-4 text-sky-600" />
                        My Orders
                      </Link>

                      {currentUser.role === "admin" && (
                        <Link
                          href="/dashboard"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 rounded-xl hover:bg-slate-100 hover:text-slate-950 transition-colors"
                        >
                          <LayoutDashboard className="w-4 h-4 text-slate-700" />
                          Admin Dashboard
                        </Link>
                      )}
                    </div>

                    {onLogout && (
                      <div className="pt-1">
                        <button
                          onClick={handleLogoutClick}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden sm:flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 hover:text-sky-700 hover:bg-sky-50/60 rounded-full border border-sky-200/80 transition-all shadow-2xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </Link>
          )}

          {/* Shop Now Primary Button */}
          <button
            onClick={handleShopNowClick}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white text-xs font-bold shadow-md shadow-sky-500/25 hover:shadow-lg hover:shadow-sky-500/35 active:scale-95 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Shop Now
          </button>

          {/* Mobile Toggle Button */}
          <button
            className="md:hidden p-2.5 rounded-full bg-white border border-sky-200 text-slate-700 hover:bg-sky-50 transition-colors cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle Navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-white/95 backdrop-blur-2xl border-b border-sky-200/80 px-6 py-5 space-y-3 shadow-xl"
          >
            <div className="space-y-1">
              <button
                onClick={() => {
                  setMobileOpen(false);
                  handleShopNowClick();
                }}
                className="w-full text-left flex items-center justify-between px-3 py-2.5 text-sm font-bold text-slate-800 rounded-xl hover:bg-sky-50"
              >
                Products
              </button>
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileOpen(false);
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="block px-3 py-2.5 text-sm font-medium text-slate-600 rounded-xl hover:bg-sky-50"
              >
                Features
              </a>
              <a
                href="#customer-love"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileOpen(false);
                  document.getElementById("customer-love")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="block px-3 py-2.5 text-sm font-medium text-slate-600 rounded-xl hover:bg-sky-50"
              >
                Reviews
              </a>
              <Link
                href="/store/about"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-slate-600 rounded-xl hover:bg-sky-50"
              >
                About Us
              </Link>
              <Link
                href="/store/help"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-slate-600 rounded-xl hover:bg-sky-50"
              >
                Help Center
              </Link>
            </div>

            <div className="pt-3 border-t border-sky-200/80 space-y-2">
              {currentUser ? (
                <>
                  <div className="px-3 py-2 bg-sky-50/80 rounded-xl border border-sky-100">
                    <p className="text-xs font-bold text-slate-900">
                      {currentUser.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}` : currentUser.username}
                    </p>
                    <p className="text-[11px] text-slate-500">{currentUser.email}</p>
                  </div>
                  <Link
                    href="/store/orders"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-slate-800 rounded-xl hover:bg-sky-50"
                  >
                    <ClipboardList className="w-4 h-4 text-sky-600" />
                    My Orders
                  </Link>
                  {currentUser.role === "admin" && (
                    <Link
                      href="/dashboard"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-slate-800 rounded-xl hover:bg-sky-50"
                    >
                      <LayoutDashboard className="w-4 h-4 text-slate-800" />
                      Admin Dashboard
                    </Link>
                  )}
                  {onLogout && (
                    <button
                      onClick={(e) => {
                        setMobileOpen(false);
                        handleLogoutClick(e);
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-rose-600 rounded-xl hover:bg-rose-50"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  )}
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-bold text-slate-700 bg-slate-100 rounded-xl"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              )}

              <button
                onClick={() => {
                  setMobileOpen(false);
                  handleShopNowClick();
                }}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 text-white font-bold text-sm shadow-md"
              >
                <ShoppingBag className="w-4 h-4" />
                Shop Now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
