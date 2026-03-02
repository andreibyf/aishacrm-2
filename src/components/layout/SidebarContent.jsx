import React from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableNavItem } from '@/components/shared/SortableNavItem';
import { GripVertical, RotateCcw } from 'lucide-react';
import Clock from '@/components/shared/Clock';

/**
 * SidebarContent - Main navigation sidebar for the CRM application
 *
 * Displays company branding, primary navigation items, and secondary navigation items
 * with drag-and-drop reordering support.
 */
export default function SidebarContent({
  user,
  selectedTenantId,
  selectedTenant,
  logoUrl,
  displayedLogoUrl,
  companyName,
  primaryColor,
  accentColor,
  filteredNavItems,
  filteredSecondaryNavItems,
  currentPageName,
  isDragMode,
  handleNavDragEnd,
  handleSecondaryDragEnd,
  handleResetNavOrder,
  setIsDragMode,
  hasCustomNavOrder,
  hasCustomSecondaryOrder,
  sensors,
  createPageUrl,
  onNavClick,
}) {
  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      <div
        className="border-b border-slate-800 px-4 py-4 flex flex-col items-center"
        data-testid="sidebar-header"
      >
        {logoUrl ? (
          <img
            src={displayedLogoUrl}
            alt={companyName}
            className="h-16 w-auto max-w-[160px] object-contain"
            onError={(e) => {
              // Hard fallback to global app logo so branding is always visible
              try {
                const img = e?.currentTarget || e?.target;
                if (!img) return;

                // Prevent infinite retry loop by only attempting fallback once
                if (!img.dataset.fallbackApplied) {
                  img.dataset.fallbackApplied = '1';
                  const fallbackSrc = '/assets/Ai-SHA-logo-2.png'; // stable URL; no cache-busting here
                  img.src = fallbackSrc;
                  img.style.display = ''; // ensure it's visible
                  if (import.meta.env.DEV) {
                    console.debug('Logo failed to load, swapped to default:', {
                      raw: logoUrl,
                      resolved: displayedLogoUrl,
                      fallback: fallbackSrc,
                    });
                  }
                  return;
                }
              } catch (err) {
                if (import.meta.env.DEV) {
                  console.debug('Logo fallback swap error (safe to ignore):', err?.message || err);
                }
              }

              // If even the fallback fails, show the text-based placeholder
              const img = e?.currentTarget || e?.target;
              if (img) {
                img.style.display = 'none';
                if (img.nextElementSibling) {
                  img.nextElementSibling.style.display = 'flex';
                }
              }
            }}
            onLoad={(e) => {
              const fallback = e.target.nextElementSibling;
              if (fallback) fallback.style.display = 'none';
            }}
          />
        ) : null}

        <div className={`h-12 flex items-center justify-center ${logoUrl ? 'hidden' : ''}`}>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <span className="text-on-primary font-bold text-xl">
              {companyName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-bold text-xl text-slate-100 ml-2">{companyName}</span>
        </div>

        {(user?.role === 'superadmin' || user?.role === 'admin') &&
          selectedTenantId &&
          selectedTenant && (
            <p className="text-xs text-slate-400 mt-1 text-center">
              Managing Client:{' '}
              <span className="font-medium text-slate-300">{selectedTenant.name}</span>
            </p>
          )}
        {(user?.role === 'superadmin' || user?.role === 'admin') && !selectedTenantId && (
          <p className="text-xs text-orange-400 mt-1 text-center">⚠️ No Client Selected</p>
        )}
      </div>

      <div className="px-4 py-2">
        <Clock />
      </div>

      <div className="px-4 flex items-center justify-between">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Navigation</p>
        <div className="flex items-center gap-1">
          {(hasCustomNavOrder || hasCustomSecondaryOrder) && (
            <button
              type="button"
              onClick={handleResetNavOrder}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Reset to default order"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsDragMode(!isDragMode)}
            className={`p-1 transition-colors ${isDragMode ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title={isDragMode ? 'Exit reorder mode' : 'Reorder navigation items'}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <nav className="flex-1 px-4 py-1 overflow-y-auto" data-testid="main-navigation">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleNavDragEnd}
        >
          <SortableContext
            items={filteredNavItems.map((item) => item.href)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {filteredNavItems.map((item) => (
                <SortableNavItem
                  key={item.href}
                  item={item}
                  isActive={currentPageName === item.href}
                  createPageUrl={createPageUrl}
                  onNavClick={onNavClick}
                  isDragMode={isDragMode}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      <div className="mt-auto p-4 border-t border-slate-800">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSecondaryDragEnd}
        >
          <SortableContext
            items={filteredSecondaryNavItems.map((item) => item.href)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {filteredSecondaryNavItems.map((item) => (
                <li key={item.href}>
                  <div className="flex items-center">
                    {isDragMode && !item.isAvatar && (
                      <div className="p-1 mr-1 text-slate-500">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                    <Link
                      to={createPageUrl(item.href)}
                      data-testid={`nav-${item.href.toLowerCase()}`}
                      className={`flex-1 flex items-center ${
                        item.isAvatar ? 'justify-center' : 'gap-2.5'
                      } px-3 py-2 rounded-md transition-all duration-150 text-sm ${
                        currentPageName === item.href
                          ? item.isAvatar
                            ? 'bg-transparent'
                            : 'font-semibold bg-white/[0.07] border-l-[3px]'
                          : 'font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                      }`}
                      onClick={onNavClick}
                      style={
                        currentPageName === item.href && !item.isAvatar
                          ? {
                              borderLeftColor: 'var(--primary-color)',
                              paddingLeft: 'calc(0.75rem - 3px)',
                              color: '#f1f5f9',
                            }
                          : {}
                      }
                    >
                      {item.isAvatar ? (
                        <div
                          className="relative"
                          style={{
                            borderRadius: '50%',
                            padding: '3px',
                            background:
                              currentPageName === item.href
                                ? `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                                : 'transparent',
                            boxShadow:
                              currentPageName === item.href
                                ? `0 0 15px ${primaryColor}, 0 0 30px ${accentColor}`
                                : 'none',
                          }}
                        >
                          <img
                            src={item.avatarUrl}
                            alt="AI Assistant"
                            style={{
                              width: '0.75in',
                              height: '0.75in',
                              borderRadius: '50%',
                            }}
                            className={`object-cover sidebar-avatar-border ${
                              currentPageName === item.href
                                ? 'opacity-100'
                                : 'opacity-90 hover:opacity-100'
                            }`}
                          />
                        </div>
                      ) : (
                        <item.icon
                          className="w-4 h-4 flex-shrink-0"
                          style={{
                            color:
                              currentPageName === item.href ? 'var(--primary-color)' : undefined,
                          }}
                        />
                      )}

                      {!item.isAvatar && <span>{item.label}</span>}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
