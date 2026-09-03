'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import styles from './SearchAutocomplete.module.css';
import { BASE_URL } from '@/lib/api-base';

export function SearchAutocomplete({ language = 'en' }: { language?: string }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim() || !showDropdown) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/youtube/suggest?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch (err) {
        console.error('Failed to fetch suggestions', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, showDropdown]);

  const handleSubmit = (e?: React.FormEvent, submitQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = submitQuery || query;
    if (!finalQuery.trim()) return;
    
    // Support direct pasting of youtube URLs
    if (finalQuery.includes('youtube.com/') || finalQuery.includes('youtu.be/')) {
       // Since the new flow relies on selecting videos, pasting a URL directly should probably route to a search page for that URL or add it to cart.
       // We can route to search for the URL.
    }
    
    setShowDropdown(false);
    const editSkillId = searchParams.get('editSkillId');
    router.push(`/${language}/dashboard?q=${encodeURIComponent(finalQuery)}${editSkillId ? `&editSkillId=${editSkillId}` : ''}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        setQuery(suggestions[activeIndex]);
        handleSubmit(undefined, suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <form onSubmit={handleSubmit} className={styles.searchForm}>
        <div className={styles.inputContainer}>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              className={styles.input}
              placeholder="Search or paste a YouTube link..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button type="submit" className={styles.searchButton}>
            <Search size={20} />
          </button>
        </div>
      </form>

      {showDropdown && suggestions.length > 0 && (
        <ul className={styles.dropdown}>
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              className={`${styles.suggestionItem} ${index === activeIndex ? styles.active : ''}`}
              onClick={() => {
                setQuery(suggestion);
                handleSubmit(undefined, suggestion);
              }}
            >
              <Search size={16} className={styles.suggestionIcon} />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
