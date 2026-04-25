-- ============================================================
-- FICA Search Targets — Full National Expansion
-- TCP Assistance | tcpadvisors.com
-- Priority 1 = highest, 10 = lowest
-- email_only = true means calls/SMS blocked, email allowed
-- ============================================================

INSERT INTO fica_search_targets (city, state, industry, place_type, keyword, email_only, priority, added_by) VALUES

-- ════════════════════════════════════════════════════════════
-- TIER 1 — HIGHEST ROI TOURIST MARKETS
-- ════════════════════════════════════════════════════════════

-- Las Vegas, NV (MASSIVE — thousands of tipped employees)
('Las Vegas',        'Nevada',          'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Las Vegas',        'Nevada',          'bar and nightclub',       'bar',           'bar nightclub',            false, 1, 'tcp_strategy'),
('Las Vegas',        'Nevada',          'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Las Vegas',        'Nevada',          'catering company',        'meal_catering', 'catering company',         false, 1, 'tcp_strategy'),
('Las Vegas',        'Nevada',          'spa and salon',           'spa',           'spa salon tipped',         false, 1, 'tcp_strategy'),
('Henderson',        'Nevada',          'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Henderson',        'Nevada',          'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- Gatlinburg / Pigeon Forge, TN (Smoky Mountains — huge tourist corridor)
('Gatlinburg',       'Tennessee',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Gatlinburg',       'Tennessee',       'bar and nightclub',       'bar',           'bar nightclub',            false, 1, 'tcp_strategy'),
('Gatlinburg',       'Tennessee',       'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Pigeon Forge',     'Tennessee',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Pigeon Forge',     'Tennessee',       'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Sevierville',      'Tennessee',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),

-- Myrtle Beach, SC
('Myrtle Beach',     'South Carolina',  'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Myrtle Beach',     'South Carolina',  'bar and nightclub',       'bar',           'bar nightclub',            false, 1, 'tcp_strategy'),
('Myrtle Beach',     'South Carolina',  'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),
('Myrtle Beach',     'South Carolina',  'catering company',        'meal_catering', 'catering company',         false, 2, 'tcp_strategy'),
('North Myrtle Beach','South Carolina', 'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Hilton Head',      'South Carolina',  'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Hilton Head',      'South Carolina',  'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),

-- New Orleans, LA (already have some — add more)
('New Orleans',      'Louisiana',       'spa and salon',           'spa',           'spa salon tipped',         false, 1, 'tcp_strategy'),
('New Orleans',      'Louisiana',       'meal_catering',           'meal_catering', 'catering company',         false, 1, 'tcp_strategy'),
('Metairie',         'Louisiana',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),

-- ════════════════════════════════════════════════════════════
-- TIER 2 — HIGH VOLUME TOURIST + METRO MARKETS
-- ════════════════════════════════════════════════════════════

-- Florida (EMAIL ONLY — high volume)
('Key West',         'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Key West',         'Florida',         'bar and nightclub',       'bar',           'bar nightclub',            true,  1, 'tcp_strategy'),
('Key West',         'Florida',         'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('Miami Beach',      'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Miami Beach',      'Florida',         'bar and nightclub',       'bar',           'bar nightclub',            true,  1, 'tcp_strategy'),
('Miami Beach',      'Florida',         'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Fort Myers',       'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Fort Myers',       'Florida',         'hotel and resort',        'lodging',       'hotel resort',             true,  2, 'tcp_strategy'),
('Daytona Beach',    'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Daytona Beach',    'Florida',         'hotel and resort',        'lodging',       'hotel resort',             true,  2, 'tcp_strategy'),
('St Petersburg',    'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('St Petersburg',    'Florida',         'bar and nightclub',       'bar',           'bar nightclub',            true,  2, 'tcp_strategy'),
('Pensacola',        'Florida',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Pensacola Beach',  'Florida',         'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Amelia Island',    'Florida',         'hotel and resort',        'lodging',       'hotel resort',             true,  2, 'tcp_strategy'),

-- Arizona
('Scottsdale',       'Arizona',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Scottsdale',       'Arizona',         'bar and nightclub',       'bar',           'bar nightclub',            false, 1, 'tcp_strategy'),
('Scottsdale',       'Arizona',         'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Scottsdale',       'Arizona',         'spa and salon',           'spa',           'spa salon tipped',         false, 2, 'tcp_strategy'),
('Sedona',           'Arizona',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Sedona',           'Arizona',         'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Phoenix',          'Arizona',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Phoenix',          'Arizona',         'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),
('Tucson',           'Arizona',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- California (email only — CA has TCPA restrictions)
('Napa',             'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Napa',             'California',      'hotel and resort',        'lodging',       'hotel resort winery',      true,  1, 'tcp_strategy'),
('Sonoma',           'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Santa Barbara',    'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Santa Barbara',    'California',      'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('Monterey',         'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Palm Springs',     'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Palm Springs',     'California',      'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('San Diego',        'California',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('San Diego',        'California',      'hotel and resort',        'lodging',       'hotel resort',             true,  2, 'tcp_strategy'),

-- Colorado
('Denver',           'Colorado',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Denver',           'Colorado',        'bar and nightclub',       'bar',           'bar nightclub',            false, 2, 'tcp_strategy'),
('Aspen',            'Colorado',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Aspen',            'Colorado',        'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Breckenridge',     'Colorado',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Breckenridge',     'Colorado',        'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Vail',             'Colorado',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Vail',             'Colorado',        'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Steamboat Springs','Colorado',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),

-- Georgia (EMAIL ONLY)
('Savannah',         'Georgia',         'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('Savannah',         'Georgia',         'catering company',        'meal_catering', 'catering company',         true,  2, 'tcp_strategy'),
('Jekyll Island',    'Georgia',         'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Jekyll Island',    'Georgia',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('St Simons Island', 'Georgia',         'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('St Simons Island', 'Georgia',         'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),

-- Virginia
('Virginia Beach',   'Virginia',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Virginia Beach',   'Virginia',        'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),
('Virginia Beach',   'Virginia',        'bar and nightclub',       'bar',           'bar nightclub',            false, 2, 'tcp_strategy'),
('Richmond',         'Virginia',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Charlottesville',  'Virginia',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- North Carolina (expanded)
('Outer Banks',      'North Carolina',  'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Outer Banks',      'North Carolina',  'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),
('Wilmington',       'North Carolina',  'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Wrightsville Beach','North Carolina', 'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),

-- Kentucky
('Louisville',       'Kentucky',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Louisville',       'Kentucky',        'bar and nightclub',       'bar',           'bar nightclub',            false, 2, 'tcp_strategy'),
('Lexington',        'Kentucky',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Arkansas
('Hot Springs',      'Arkansas',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Hot Springs',      'Arkansas',        'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),
('Fayetteville',     'Arkansas',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Missouri
('Branson',          'Missouri',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Branson',          'Missouri',        'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Kansas City',      'Missouri',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Kansas City',      'Missouri',        'bar and nightclub',       'bar',           'bar nightclub',            false, 2, 'tcp_strategy'),
('St Louis',         'Missouri',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- ════════════════════════════════════════════════════════════
-- TIER 3 — MAJOR METRO MARKETS (EMAIL ONLY WHERE APPLICABLE)
-- ════════════════════════════════════════════════════════════

-- Illinois (email only — TCPA strict)
('Chicago',          'Illinois',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Chicago',          'Illinois',        'bar and nightclub',       'bar',           'bar nightclub',            true,  2, 'tcp_strategy'),
('Chicago',          'Illinois',        'hotel and resort',        'lodging',       'hotel resort',             true,  2, 'tcp_strategy'),

-- New York (email only)
('New York City',    'New York',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('New York City',    'New York',        'bar and nightclub',       'bar',           'bar nightclub',            true,  2, 'tcp_strategy'),
('Hamptons',         'New York',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Hamptons',         'New York',        'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('Saratoga Springs', 'New York',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),

-- New Jersey (email only)
('Atlantic City',    'New Jersey',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Atlantic City',    'New Jersey',      'hotel and resort',        'lodging',       'hotel resort',             true,  1, 'tcp_strategy'),
('Cape May',         'New Jersey',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),

-- Massachusetts
('Boston',           'Massachusetts',   'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Cape Cod',         'Massachusetts',   'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Cape Cod',         'Massachusetts',   'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),
('Martha Vineyard',  'Massachusetts',   'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Nantucket',        'Massachusetts',   'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Nantucket',        'Massachusetts',   'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),

-- Rhode Island
('Newport',          'Rhode Island',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Newport',          'Rhode Island',    'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Providence',       'Rhode Island',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Maine
('Bar Harbor',       'Maine',           'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Bar Harbor',       'Maine',           'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Portland',         'Maine',           'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),

-- Michigan
('Traverse City',    'Michigan',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Traverse City',    'Michigan',        'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),
('Mackinac Island',  'Michigan',        'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Detroit',          'Michigan',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Ohio
('Columbus',         'Ohio',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Cleveland',        'Ohio',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Cincinnati',       'Ohio',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Pennsylvania
('Philadelphia',     'Pennsylvania',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Pittsburgh',       'Pennsylvania',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Pocono Mountains', 'Pennsylvania',    'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- Utah
('Park City',        'Utah',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Park City',        'Utah',            'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Salt Lake City',   'Utah',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Moab',             'Utah',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Moab',             'Utah',            'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- Oregon
('Portland',         'Oregon',          'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Bend',             'Oregon',          'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Bend',             'Oregon',          'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- Washington (email only)
('Seattle',          'Washington',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  3, 'tcp_strategy'),
('Leavenworth',      'Washington',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),
('Walla Walla',      'Washington',      'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),

-- Hawaii (email only — strict TCPA)
('Honolulu',         'Hawaii',          'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Honolulu',         'Hawaii',          'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Maui',             'Hawaii',          'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Maui',             'Hawaii',          'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Kauai',            'Hawaii',          'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),

-- Minnesota
('Minneapolis',      'Minnesota',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Duluth',           'Minnesota',       'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Maryland (email only)
('Ocean City',       'Maryland',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  1, 'tcp_strategy'),
('Ocean City',       'Maryland',        'hotel and resort',        'lodging',       'hotel resort beachfront',  true,  1, 'tcp_strategy'),
('Annapolis',        'Maryland',        'full-service restaurant', 'restaurant',    'full service restaurant',  true,  2, 'tcp_strategy'),

-- Delaware
('Rehoboth Beach',   'Delaware',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Rehoboth Beach',   'Delaware',        'hotel and resort',        'lodging',       'hotel resort beachfront',  false, 1, 'tcp_strategy'),

-- Connecticut
('Mystic',           'Connecticut',     'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Greenwich',        'Connecticut',     'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),

-- New Hampshire
('Portsmouth',       'New Hampshire',   'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('North Conway',     'New Hampshire',   'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- Vermont
('Stowe',            'Vermont',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 1, 'tcp_strategy'),
('Stowe',            'Vermont',         'hotel and resort',        'lodging',       'hotel resort',             false, 1, 'tcp_strategy'),
('Burlington',       'Vermont',         'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Nebraska
('Omaha',            'Nebraska',        'full-service restaurant', 'restaurant',    'full service restaurant',  false, 4, 'tcp_strategy'),

-- Kansas
('Wichita',          'Kansas',          'full-service restaurant', 'restaurant',    'full service restaurant',  false, 4, 'tcp_strategy'),

-- Iowa
('Des Moines',       'Iowa',            'full-service restaurant', 'restaurant',    'full service restaurant',  false, 4, 'tcp_strategy'),

-- New Mexico
('Santa Fe',         'New Mexico',      'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Santa Fe',         'New Mexico',      'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),
('Albuquerque',      'New Mexico',      'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- Idaho
('Sun Valley',       'Idaho',           'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),
('Sun Valley',       'Idaho',           'full-service restaurant', 'restaurant',    'full service restaurant',  false, 2, 'tcp_strategy'),
('Boise',            'Idaho',           'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),

-- South Dakota
('Rapid City',       'South Dakota',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 3, 'tcp_strategy'),
('Deadwood',         'South Dakota',    'hotel and resort',        'lodging',       'hotel resort',             false, 2, 'tcp_strategy'),

-- North Dakota
('Fargo',            'North Dakota',    'full-service restaurant', 'restaurant',    'full service restaurant',  false, 5, 'tcp_strategy')

ON CONFLICT (city, state, industry) DO NOTHING;

-- ── Verify total count ─────────────────────────────────────────────────────
SELECT 
  added_by,
  COUNT(*) as targets,
  SUM(CASE WHEN email_only THEN 1 ELSE 0 END) as email_only,
  SUM(CASE WHEN NOT email_only THEN 1 ELSE 0 END) as calls_allowed
FROM fica_search_targets
GROUP BY added_by
ORDER BY added_by;
