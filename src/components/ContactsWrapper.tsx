import { useState } from 'react';
import { ContactGroupsPage } from './ContactGroupsPage';
import { ContactGroupDetailPage } from './ContactGroupDetailPage';

type View = 'groups' | 'group-detail';

export function ContactsWrapper() {
  const [currentView, setCurrentView] = useState<View>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleOpenGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setCurrentView('group-detail');
  };

  const handleBackToGroups = () => {
    setSelectedGroupId(null);
    setCurrentView('groups');
  };

  if (currentView === 'group-detail' && selectedGroupId) {
    return <ContactGroupDetailPage groupId={selectedGroupId} onBack={handleBackToGroups} onOpenSubgroup={handleOpenGroup} />;
  }

  return <ContactGroupsPage onOpenGroup={handleOpenGroup} />;
}
