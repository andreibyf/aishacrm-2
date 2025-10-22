import { useState, useMemo } from 'react';

export function useTagFilter(data, tagField = 'tags') {
  const [selectedTags, setSelectedTags] = useState([]);

  const allTags = useMemo(() => {
    if (!Array.isArray(data)) return [];
    
    const tagCounts = {};
    data.forEach(item => {
      const tags = item[tagField];
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag && typeof tag === 'string') {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data, tagField]);

  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (selectedTags.length === 0) return data;

    return data.filter(item => {
      const itemTags = item[tagField];
      if (!Array.isArray(itemTags)) return false;
      
      return selectedTags.every(selectedTag => itemTags.includes(selectedTag));
    });
  }, [data, selectedTags, tagField]);

  return {
    selectedTags,
    setSelectedTags,
    allTags,
    filteredData
  };
}