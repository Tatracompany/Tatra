(function () {
  'use strict';

  const FLOOR_ORDER = ['تجاري', 'سرداب', 'ارضي', 'اول', 'ثاني', 'ملاحق'];
  const STATUS_META = {
    paid: { label: 'Paid', className: 'badge-paid' },
    partial: { label: 'Partial', className: 'badge-partial' },
    upcoming: { label: 'Unpaid', className: 'badge-unpaid' },
    overdue: { label: 'Late', className: 'badge-late' },
    precontract: { label: 'Starts next month', className: 'badge-precontract' },
    vacant: { label: 'Empty', className: 'badge-vacant' }
  };
  const NATIONALITY_OPTIONS = ['Not set', 'Kuwaiti', 'Egyptian', 'Indian', 'Bangladeshi', 'Pakistani', 'Sri Lankan', 'Nepali', 'Filipino', 'Syrian', 'Jordanian', 'Other'];
  const FLOOR_OPTIONS = [
    { value: '', label: 'Select floor' },
    { value: 'تجاري', label: 'Commercial' },
    { value: 'سرداب', label: 'Basement' },
    { value: 'ارضي', label: 'Ground' },
    { value: 'اول', label: 'First' },
    { value: 'ثاني', label: 'Second' },
    { value: 'ملاحق', label: 'Annex' }
  ];
  const BUILD_INFO = {
    commit: '__BUILD_COMMIT__',
    builtAt: '__BUILD_TIME__'
  };

  window.__LANDLORD_APP_CONFIG__ = {
    FLOOR_ORDER,
    STATUS_META,
    NATIONALITY_OPTIONS,
    FLOOR_OPTIONS,
    BUILD_INFO
  };
})();
