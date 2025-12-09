import React, { useState, useEffect, useMemo } from 'react';
import { AirtableService } from '../services/airtable';
import { Contact } from '../types';
import { Loader2, Download, Upload, Linkedin, Box, Flag, Search } from 'lucide-react';
import { saveAs } from 'file-saver';
import FulfillmentModal from '../components/FulfillmentModal';
import FlagOrderModal from '../components/FlagOrderModal';
import BulkFulfillmentModal, { MatchedOrder } from '../components/BulkFulfillmentModal';

type FilterStatus = 'unfulfilled' | 'fulfilled' | 'all';

const PrintShipDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('unfulfilled');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);
  const [selectedContactForFulfillment, setSelectedContactForFulfillment] = useState<Contact | null>(null);
  
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [selectedContactForFlag, setSelectedContactForFlag] = useState<Contact | null>(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Calculate counts for tabs
  const counts = useMemo(() => {
    const unfulfilled = contacts.filter(c => c.specificStage === 'Fulfillment').length;
    const fulfilled = contacts.filter(c => c.specificStage === 'Shipped').length;
    // 'All' is just the sum of these two since we pre-filter contacts in fetchContacts
    return {
      unfulfilled,
      fulfilled,
      all: unfulfilled + fulfilled
    };
  }, [contacts]);

  useEffect(() => {
    fetchContacts();
  }, []);

  useEffect(() => {
    filterContacts();
  }, [contacts, filterStatus, searchQuery]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const allContacts = await AirtableService.getContacts();
      // Only keep relevant contacts for this dashboard (Fulfillment or Shipped)
      const relevantContacts = allContacts.filter(contact => {
        const isRelevantStage = contact.specificStage === 'Fulfillment' || contact.specificStage === 'Shipped';
        // Removed strict requirement for State/Province, as requested
        const hasAddress = contact.streetLine1 && contact.city && contact.postCode && contact.countryCode;
        return isRelevantStage && hasAddress;
      });
      setContacts(relevantContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterContacts = () => {
    let filtered = contacts;

    if (filterStatus === 'unfulfilled') {
      filtered = contacts.filter(c => c.specificStage === 'Fulfillment');
    } else if (filterStatus === 'fulfilled') {
      filtered = contacts.filter(c => c.specificStage === 'Shipped');
    }
    // 'all' includes both, which is already the base set of contacts loaded

    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(c => 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.company && c.company.toLowerCase().includes(query)) ||
            (c.city && c.city.toLowerCase().includes(query)) ||
            (c.state && c.state.toLowerCase().includes(query)) ||
            (c.postCode && c.postCode.toLowerCase().includes(query)) ||
            (c.countryCode && c.countryCode.toLowerCase().includes(query)) ||
            (c.latestTrackingNumber && c.latestTrackingNumber.toLowerCase().includes(query))
        );
    }

    setFilteredContacts(filtered);
    // Clear selection when filter changes to avoid confusion
    setSelectedContactIds(new Set());
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    } else {
      setSelectedContactIds(new Set());
    }
  };

  const handleSelectContact = (id: string) => {
    const newSelected = new Set(selectedContactIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContactIds(newSelected);
  };

  const handleExportCSV = () => {
    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
    if (selected.length === 0) return;

    const csvHeader = [
      'Full Name',
      'Company',
      'LinkedIn URL',
      'Street Line 1',
      'Street Line 2',
      'City',
      'State / Province',
      'Postal Code',
      'Country',
      'Order Items',
      'Design File URL',
      'Tracking Number',
      'Ship Date',
      'Fulfill Flag'
    ].join(',');

    const csvRows = selected.map(c => {
      const orderItems = c.draftOrderItems ? c.draftOrderItems.join('; ') : '';
      const designFileUrl = c.designFiles && c.designFiles.length > 0 ? c.designFiles[0].url : '';
      
      return [
        `"${c.name || ''}"`,
        `"${c.company || ''}"`,
        `"${c.linkedinUrl || ''}"`,
        `"${c.streetLine1 || ''}"`,
        `"${c.streetLine2 || ''}"`,
        `"${c.city || ''}"`,
        `"${c.state || ''}"`,
        `"${c.postCode || ''}"`,
        `"${c.countryCode || ''}"`,
        `"${orderItems}"`,
        `"${designFileUrl}"`,
        `"${c.latestTrackingNumber || ''}"`,
        `"${c.latestShipDate || ''}"`,
        `"${c.fulfillFlag || ''}"`
      ].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    // Changed filename format as requested
    saveAs(blob, `spacecadet_${filterStatus}_orders_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleBeginFulfillment = async () => {
    if (selectedContactIds.size === 0) return;
    
    setProcessing(true);
    try {
        handleExportCSV();
        alert(`Started fulfillment for ${selectedContactIds.size} orders.`);
    } catch (error) {
        console.error('Error beginning fulfillment:', error);
        alert('Failed to begin fulfillment.');
    } finally {
        setProcessing(false);
    }
  };

  const openFulfillmentModal = (contact: Contact) => {
    setSelectedContactForFulfillment(contact);
    setFulfillmentModalOpen(true);
  };

  const handleSaveFulfillment = async (contactId: string, trackingNumber: string, shipDate: string) => {
    try {
      const updatedContact = await AirtableService.updateContact(contactId, {
        latestTrackingNumber: trackingNumber,
        latestShipDate: shipDate,
        specificStage: 'Shipped' // Automatically move to Shipped stage
      } as any);

      if (updatedContact) {
        // Update local state
        setContacts(prev => prev.map(c => c.id === contactId ? updatedContact : c));
      }
    } catch (error) {
      console.error("Error saving fulfillment:", error);
      throw error;
    }
  };

  const openFlagModal = (contact: Contact) => {
    setSelectedContactForFlag(contact);
    setFlagModalOpen(true);
  };

  const handleSaveFlag = async (contactId: string, flagNote: string) => {
    try {
      const updatedContact = await AirtableService.updateContact(contactId, {
        fulfillFlag: flagNote
      } as any);

      if (updatedContact) {
        setContacts(prev => prev.map(c => c.id === contactId ? updatedContact : c));
      }
    } catch (error) {
      console.error("Error saving flag:", error);
      throw error;
    }
  };

  const handleBulkFulfillment = async (matches: MatchedOrder[]) => {
    setProcessing(true);
    try {
      // Process sequentially to avoid rate limits, or use Promise.all with small batches if needed
      // Airtable rate limit is 5 requests per second
      for (const match of matches) {
        await AirtableService.updateContact(match.contact.id, {
          latestTrackingNumber: match.trackingNumber,
          latestShipDate: match.shipDate,
          specificStage: 'Shipped'
        } as any);
      }
      
      // Refresh all contacts to reflect changes
      await fetchContacts();
      alert(`Successfully fulfilled ${matches.length} orders.`);
    } catch (error) {
      console.error("Error in bulk fulfillment:", error);
      alert("Some orders failed to update. Please check the list.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Print & Ship Dashboard</h1>

        <div className="bg-white shadow rounded-lg mb-8 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 space-y-4">
            {/* Header Row: Title and Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-lg font-medium text-gray-900">
                Orders
              </h2>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleExportCSV}
                  disabled={selectedContactIds.size === 0 || processing}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => setBulkModalOpen(true)}
                  disabled={processing}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Bulk Fulfill
                </button>
              </div>
            </div>

            {/* Filter Row: Search and Toggles */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              {/* Search Bar */}
              <div className="relative rounded-md shadow-sm max-w-md w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2"
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Status Toggle */}
              <div className="flex items-center">
                <span className="mr-3 text-sm text-gray-500 hidden sm:inline">Show:</span>
                <span className="relative z-0 inline-flex shadow-sm rounded-md">
                  <button
                    type="button"
                    onClick={() => setFilterStatus('unfulfilled')}
                    className={`relative inline-flex items-center px-4 py-2 rounded-l-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                      filterStatus === 'unfulfilled'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-600 z-20'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Unfulfilled ({counts.unfulfilled})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('fulfilled')}
                    className={`relative inline-flex items-center px-4 py-2 border-t border-b border-gray-300 text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                      filterStatus === 'fulfilled'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-600 z-20'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Fulfilled ({counts.fulfilled})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus('all')}
                    className={`relative inline-flex items-center px-4 py-2 rounded-r-md border text-sm font-medium focus:z-10 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${
                      filterStatus === 'all'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-600 z-20'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    All ({counts.all})
                  </button>
                </span>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    <input
                      type="checkbox"
                      className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      checked={filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[22%]">
                    Recipient
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[28%]">
                    Address
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                    Order Items
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                    Design File
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                    Tracking Details
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">
                      <div className="flex justify-center items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        <span className="ml-2">Loading orders...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  filteredContacts.map((contact) => (
                    <tr key={contact.id} className={selectedContactIds.has(contact.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                          checked={selectedContactIds.has(contact.id)}
                          onChange={() => handleSelectContact(contact.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                            <div className="flex items-center">
                                <span className="text-sm font-medium text-gray-900 mr-2">{contact.name}</span>
                                {contact.linkedinUrl && (
                                    <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                                        <Linkedin className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                            <span className="text-sm text-gray-500">{contact.company}</span>
                            {contact.fulfillFlag && (
                              <div className="mt-1 flex items-center text-xs text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-md w-fit">
                                <Flag className="h-3 w-3 mr-1 fill-yellow-500 text-yellow-600" />
                                <span className="truncate max-w-[150px]" title={contact.fulfillFlag}>{contact.fulfillFlag}</span>
                              </div>
                            )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{contact.streetLine1}</span>
                          {contact.streetLine2 && <span>{contact.streetLine2}</span>}
                          <span>{contact.city}, {contact.state} {contact.postCode}</span>
                          <span>{contact.countryCode}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                         {contact.draftOrderItems?.map((item, idx) => (
                             <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mr-1">
                                 {item}
                             </span>
                         ))}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:text-blue-800">
                         {contact.designFiles && contact.designFiles.length > 0 && (
                             <a href={contact.designFiles[0].url} target="_blank" rel="noopener noreferrer">
                                 Download Design
                             </a>
                         )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-col space-y-1">
                          {contact.latestTrackingNumber ? (
                            <span className="font-medium text-gray-900">
                              {contact.latestTrackingNumber}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">No tracking #</span>
                          )}
                          
                          {contact.latestShipDate ? (
                            <span className="text-xs">
                              Shipped: {new Date(contact.latestShipDate).toLocaleDateString()}
                            </span>
                          ) : null}

                          {contact.specificStage === 'Shipped' && !contact.latestTrackingNumber && (
                             <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                               Fulfilled
                             </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex flex-col space-y-3 items-end">
                          <button
                            onClick={() => openFulfillmentModal(contact)}
                            className="text-indigo-600 hover:text-indigo-900 flex items-center"
                          >
                            <Box className="h-4 w-4 mr-1" />
                            Fulfill
                          </button>
                          <button
                            onClick={() => openFlagModal(contact)}
                            className={`${contact.fulfillFlag ? 'text-yellow-600' : 'text-gray-400 hover:text-yellow-600'} flex items-center`}
                          >
                            <Flag className={`h-4 w-4 mr-1 ${contact.fulfillFlag ? 'fill-yellow-500 text-yellow-600' : ''}`} />
                            Flag
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {selectedContactForFulfillment && (
        <FulfillmentModal
          isOpen={fulfillmentModalOpen}
          onClose={() => {
            setFulfillmentModalOpen(false);
            setSelectedContactForFulfillment(null);
          }}
          contact={selectedContactForFulfillment}
          onSave={handleSaveFulfillment}
        />
      )}

      {selectedContactForFlag && (
        <FlagOrderModal
          isOpen={flagModalOpen}
          onClose={() => {
            setFlagModalOpen(false);
            setSelectedContactForFlag(null);
          }}
          contact={selectedContactForFlag}
          onSave={handleSaveFlag}
        />
      )}

      <BulkFulfillmentModal 
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        contacts={contacts} // Pass all loaded contacts
        onConfirm={handleBulkFulfillment}
      />
    </div>
  );
};

export default PrintShipDashboardPage;