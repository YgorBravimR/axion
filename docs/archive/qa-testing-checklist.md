# QA Testing Checklist - Axion

Complete testing checklist for QA validation of all features and user interactions.

---

## 1. Authentication Flow

### 1.1 Registration Page (`/register`)

- [ ] Form displays all fields: Name, Email, Password, Confirm Password
- [ ] Password requirements validation:
  - [ ] Minimum 8 characters enforced
  - [ ] Uppercase letter required
  - [ ] Lowercase letter required
  - [ ] Number required
  - [ ] Real-time requirement indicator updates
- [ ] Password match validation (confirm password must match)
- [ ] Email uniqueness validation (prevent duplicate accounts)
- [ ] Error messages display for invalid inputs
- [ ] Auto sign-in after successful registration
- [ ] Redirect to dashboard after registration
- [ ] Already logged-in users redirect to home
- [ ] Link to login page works

### 1.2 Login Page (`/login`)

- [ ] Form displays fields: Email, Password
- [ ] Email validation works (lowercase conversion)
- [ ] Invalid credentials error message displays
- [ ] Show/Hide password toggle works
- [ ] Multi-account selection appears when user has multiple trading accounts
- [ ] Default account auto-selects when user has one account
- [ ] Callback URL parameter honored after login
- [ ] Already logged-in users redirect to home
- [ ] Link to registration page works

### 1.3 Account Selection Page (`/select-account`)

- [ ] Displays all user's trading accounts
- [ ] Account type badge visible (Personal/Prop)
- [ ] Default account highlighted
- [ ] Selecting account sets session and redirects
- [ ] Cancel/back button works

### 1.4 Logout

- [ ] Logout option in user menu works
- [ ] Session cleared after logout
- [ ] Redirects to login page
- [ ] Cannot access protected routes after logout

---

## 2. Navigation & Layout

### 2.1 Sidebar Navigation

- [ ] All navigation items visible:
  - [ ] Dashboard
  - [ ] Journal
  - [ ] Analytics
  - [ ] Playbook
  - [ ] Reports
  - [ ] Monthly
  - [ ] Settings
- [ ] Active route highlighted correctly
- [ ] Sidebar collapse/expand toggle works
- [ ] Keyboard accessible (tabindex, aria-label)
- [ ] Navigation icons display correctly
- [ ] Responsive behavior on mobile

### 2.2 Account Switcher

- [ ] Shows current trading account name
- [ ] Dropdown displays all user's trading accounts
- [ ] Account type indicators visible (Personal/Prop)
- [ ] Selecting account updates session
- [ ] Page data refreshes after switch
- [ ] Can only see own accounts

### 2.3 User Menu

- [ ] Displays user initials avatar
- [ ] Dropdown menu opens on click
- [ ] Settings link navigation works
- [ ] Logout option works

### 2.4 Theme Toggle

- [ ] Dark/Light mode switch works
- [ ] Theme persists across sessions
- [ ] All components respect theme

### 2.5 Language Selector

- [ ] Language options display (PT-BR, EN)
- [ ] Selection updates UI immediately
- [ ] Selection persists across sessions

---

## 3. Dashboard Page (`/`)

### 3.1 KPI Cards

- [ ] Displays: Gross PnL, Net PnL, Win Rate, Profit Factor, Average R
- [ ] Values update based on current account
- [ ] Color coding for positive/negative values
- [ ] Trend indicators show (if applicable)

### 3.2 Discipline Score Card

- [ ] Shows current discipline score percentage
- [ ] Trend indicator visible (up/down/stable)
- [ ] Recent compliance displayed
- [ ] Color coding based on score

### 3.3 Trading Calendar

- [ ] Displays current month grid
- [ ] Days with trades show P&L
- [ ] Color coding (green for profit, red for loss)
- [ ] Previous/next month navigation works
- [ ] Today highlighted
- [ ] Clickable days open day detail modal
- [ ] Trade count per day displayed

### 3.4 Quick Stats

- [ ] Current streak displays (win/loss)
- [ ] Longest win streak shows
- [ ] Longest loss streak shows
- [ ] Best day highlighted
- [ ] Worst day highlighted

### 3.5 Equity Curve Chart

- [ ] Displays equity progression
- [ ] Tooltip shows value on hover
- [ ] Responsive to screen size
- [ ] Proper date formatting
- [ ] Line color indicates overall performance

### 3.6 Daily PnL Bar Chart

- [ ] Shows daily P&L for current month
- [ ] Color coded (green wins, red losses)
- [ ] Hover shows detailed daily stats
- [ ] Clickable bars open day detail modal

### 3.7 Performance Radar Chart

- [ ] Multiple metrics displayed:
  - [ ] Win Rate
  - [ ] Avg R
  - [ ] Profit Factor
  - [ ] Discipline
  - [ ] Consistency
- [ ] Normalized scale 0-100 visible
- [ ] Interactive hover tooltips

### 3.8 Day Detail Modal

- [ ] Modal opens when clicking calendar day or bar chart
- [ ] Selected date displays in header
- [ ] Loading state while fetching data
- [ ] Day summary stats display:
  - [ ] Net P&L
  - [ ] Gross P&L
  - [ ] Total Fees
  - [ ] Win Rate
  - [ ] Total Trades
  - [ ] Avg R
  - [ ] Profit Factor
- [ ] Intraday equity curve displays
- [ ] List of trades for that day shows
- [ ] Clicking trade navigates to trade detail
- [ ] Modal closes with X button
- [ ] Modal closes with Escape key
- [ ] Modal closes when clicking outside

---

## 4. Journal - Trade Management

### 4.1 Journal Main Page (`/journal`)

- [ ] Lists all trades (paginated)
- [ ] Pagination controls work (next, previous, page numbers)
- [ ] Trade count summary shows
- [ ] "New Trade" button visible
- [ ] Filter by asset dropdown works
- [ ] Filter by outcome works (win/loss/breakeven/open)
- [ ] Filters can be cleared
- [ ] Each trade card displays:
  - [ ] Asset symbol
  - [ ] Direction badge (Long/Short)
  - [ ] Entry date
  - [ ] Entry/exit prices
  - [ ] P&L amount (colored)
  - [ ] R-Multiple (if available)
  - [ ] Outcome badge
  - [ ] Tags (if any)
- [ ] Clicking trade card navigates to detail

### 4.2 New Trade Page (`/journal/new`)

- [ ] Page header displays
- [ ] "Back" button navigates to journal
- [ ] Two tabs present: "Single Entry" / "CSV Import"
- [ ] Trade mode selector (Simple vs Scaled Position)

### 4.3 Simple Mode Trade Form

#### Basic Info Section
- [ ] Asset dropdown populated (from configured assets)
- [ ] Direction selector (Long/Short) works
- [ ] Entry date picker works
- [ ] Entry time picker works
- [ ] Exit date picker (optional) works
- [ ] Exit time picker (optional) works
- [ ] Entry price input accepts decimals
- [ ] Exit price input (optional) accepts decimals
- [ ] Position size input accepts decimals

#### Risk Management Section
- [ ] Stop loss input (optional)
- [ ] Take profit input (optional)
- [ ] Risk amount input
- [ ] Planned R-Multiple auto-calculated when possible

#### Classification Section
- [ ] Strategy dropdown populated
- [ ] Strategy selection optional
- [ ] Timeframe dropdown populated
- [ ] Timeframe selection optional
- [ ] Tags multi-select works
- [ ] Tags filtered by type (setup/mistake/general)

#### Journal Notes Section
- [ ] Pre-Trade Thoughts textarea
- [ ] Post-Trade Reflection textarea
- [ ] Lesson Learned textarea

#### Discipline Section
- [ ] Followed Plan checkbox works
- [ ] Discipline Notes textarea

#### Fees Section
- [ ] Commission input
- [ ] Additional fees input
- [ ] MFE (Max Favorable Excursion) input
- [ ] MAE (Max Adverse Excursion) input

#### Form Calculations
- [ ] P&L calculated when exit price provided
- [ ] Outcome badge updates automatically
- [ ] Realized R-Multiple calculated when risk provided

#### Form Submission
- [ ] Required fields validated
- [ ] Submit button creates trade
- [ ] Success message appears
- [ ] Redirects to journal page
- [ ] Error messages display for validation failures

### 4.4 Scaled Position Mode Trade Form

- [ ] Initial position setup same as simple mode
- [ ] "Position is scaled" indicator shows
- [ ] Add Execution button available after initial save
- [ ] Position status indicator (Open/Partial/Closed/Over Exit)
- [ ] Execution summary section shows totals

### 4.5 CSV Import Tab

- [ ] File upload input present
- [ ] Accepted file formats noted
- [ ] CSV format specification/example shown
- [ ] File selection works
- [ ] Upload and parse works
- [ ] Validation errors show for invalid CSV
- [ ] Success count shows after import
- [ ] Imported trades appear in journal

### 4.6 Trade Detail Page (`/journal/{id}`)

#### Header Section
- [ ] Asset symbol and name display
- [ ] Trade date displays
- [ ] Direction badge (Long/Short)
- [ ] Action buttons: Edit, Delete, Back

#### Outcome Badges
- [ ] Winner/Loser badge displays
- [ ] Followed Plan / Discipline Breach badge (if applicable)

#### Metrics Grid
- [ ] Entry Price displays
- [ ] Exit Price displays (or "Open" if not closed)
- [ ] Position Size displays
- [ ] Risk Amount displays (if set)
- [ ] P&L displays with color
- [ ] Realized R-Multiple displays (if available)
- [ ] Fees/Commission display

#### Trade Executions Section (Scaled Mode)
- [ ] List of all executions displays
- [ ] Each execution shows: type, date, price, quantity
- [ ] Add Execution button works
- [ ] Edit execution works
- [ ] Delete execution works (with confirmation)
- [ ] Execution summary totals display
- [ ] Position summary accurate

#### Risk/Reward Analysis (if R-multiples exist)
- [ ] Planned R-Multiple bar displays
- [ ] Realized R-Multiple bar displays
- [ ] Visual comparison accurate
- [ ] Color coding for over/under performance

#### Trade Excursion (if MFE/MAE exist)
- [ ] MFE value and bar display
- [ ] MAE value and bar display
- [ ] Proper color coding

#### Classification Section
- [ ] Strategy name displayed (if assigned)
- [ ] Timeframe displayed (if assigned)
- [ ] Tags displayed with proper colors
- [ ] Setup tags vs mistake tags visually separated

#### Journal Notes Section
- [ ] Pre-Trade Thoughts shows (if present)
- [ ] Post-Trade Reflection shows (if present)
- [ ] Lesson Learned shows (if present)
- [ ] Discipline Notes shows (if present, highlighted)

### 4.7 Edit Trade Page (`/journal/{id}/edit`)

- [ ] Form pre-filled with existing trade data
- [ ] All fields editable
- [ ] Submit updates trade
- [ ] Cancel returns to detail page
- [ ] Success message on save
- [ ] Redirects to trade detail after save

### 4.8 Delete Trade

- [ ] Delete button visible on trade detail
- [ ] Confirmation dialog appears
- [ ] Dialog shows trade info
- [ ] Cancel button cancels deletion
- [ ] Confirm button deletes trade
- [ ] Success message appears
- [ ] Redirects to journal after deletion

### 4.9 Execution Management (Scaled Trades)

#### Add Execution
- [ ] Add Execution button opens form/modal
- [ ] Execution type selector (Entry/Exit)
- [ ] Date picker
- [ ] Time picker
- [ ] Price input
- [ ] Quantity input
- [ ] Order type dropdown (Market/Limit/Stop/Stop Limit)
- [ ] Commission input
- [ ] Fees input
- [ ] Slippage input
- [ ] Notes textarea
- [ ] Save creates execution
- [ ] Cancel closes without saving
- [ ] Position summary updates after add

#### Edit Execution
- [ ] Edit button on execution row
- [ ] Form pre-fills with existing data
- [ ] Save updates execution
- [ ] Position summary updates after edit

#### Delete Execution
- [ ] Delete button on execution row
- [ ] Confirmation required
- [ ] Execution removed from list
- [ ] Position summary updates after delete

---

## 5. Analytics Page (`/analytics`)

### 5.1 Filter Panel

- [ ] Date range picker (from/to)
- [ ] Date preset buttons (Today, This Week, This Month, etc.)
- [ ] Asset multi-select dropdown
- [ ] Direction filter (Long/Short)
- [ ] Outcome filter (Win/Loss/Breakeven)
- [ ] Timeframe filter
- [ ] Active filters count shows
- [ ] Clear all filters button
- [ ] Filters apply to all charts below

### 5.2 Variable Comparison Chart

- [ ] Group By selector works:
  - [ ] Asset
  - [ ] Timeframe
  - [ ] Hour of Day
  - [ ] Day of Week
  - [ ] Strategy
- [ ] Bar chart displays for selected grouping
- [ ] Metrics shown: Trade Count, P&L, Win Rate, Avg R, Profit Factor
- [ ] Hover tooltip shows details
- [ ] Color coding for positive/negative

### 5.3 Cumulative P&L Chart

- [ ] Line chart displays equity curve
- [ ] Filtered by date range
- [ ] Tooltip shows date and cumulative P&L
- [ ] Color based on final value (positive/negative)

### 5.4 Expected Value Section

- [ ] Win rate percentage displays
- [ ] Average win amount displays
- [ ] Average loss amount displays
- [ ] Expected value calculated correctly
- [ ] Projected P&L for 100 trades shows
- [ ] Sample size noted

### 5.5 R-Distribution Chart

- [ ] Histogram displays R-multiple ranges
- [ ] Buckets: < -2R, -2R to -1R, -1R to 0R, 0R to 1R, etc.
- [ ] Trade counts per bucket
- [ ] P&L per bucket
- [ ] Color coding (red negative, green positive)
- [ ] Hover shows bucket details

### 5.6 Tag Cloud / Tag Analysis

- [ ] All tags displayed
- [ ] Tag size/weight based on usage
- [ ] Click tag shows stats
- [ ] Stats include: count, P&L, win rate, avg R

### 5.7 Time-Based Analysis Section

#### Hourly Performance Chart
- [ ] 24-hour breakdown (or trading hours)
- [ ] Hour labels display correctly
- [ ] P&L per hour
- [ ] Trade count per hour
- [ ] Win rate per hour
- [ ] Best/worst hour highlighted

#### Day of Week Chart
- [ ] 7-day breakdown (or trading days only)
- [ ] Day names display
- [ ] P&L per day
- [ ] Trade count per day
- [ ] Win rate per day
- [ ] Best/worst day highlighted

#### Time Heatmap
- [ ] Grid displays hour × day matrix
- [ ] Color intensity based on performance
- [ ] Tooltip on hover shows:
  - [ ] Day and hour
  - [ ] Trade count
  - [ ] P&L
  - [ ] Win rate
- [ ] Best/worst time slots highlighted

---

## 6. Playbook - Strategy Management

### 6.1 Playbook Main Page (`/playbook`)

- [ ] Page header displays
- [ ] Compliance Dashboard section shows:
  - [ ] Overall compliance score
  - [ ] Compliance trend
  - [ ] Recent compliance data
- [ ] Strategy list displays
- [ ] "New Strategy" button visible
- [ ] Each strategy card shows:
  - [ ] Strategy name
  - [ ] Strategy code
  - [ ] Trade count
  - [ ] Win rate
  - [ ] Total P&L (colored)
  - [ ] Compliance percentage
- [ ] Click card navigates to detail
- [ ] Edit button on card works
- [ ] Delete button on card works

### 6.2 New Strategy Page (`/playbook/new`)

- [ ] Page header displays
- [ ] Back button navigates to playbook

#### Basic Info Section
- [ ] Code input (3-10 characters, auto uppercase)
- [ ] Code uniqueness validated
- [ ] Name input (required)
- [ ] Description textarea (optional)
- [ ] Reference Image URL input (optional)

#### Rules & Criteria Section
- [ ] Entry Criteria textarea
- [ ] Exit Criteria textarea
- [ ] Additional Notes textarea

#### Risk Settings Section
- [ ] Risk Management Rules textarea
- [ ] Target R-Multiple input (decimal)
- [ ] Max Risk per Trade % input (0-100)

#### Form Actions
- [ ] Save button creates strategy
- [ ] Cancel returns to playbook
- [ ] Validation errors display
- [ ] Success message on save
- [ ] Redirects to playbook or detail

### 6.3 Strategy Detail Page (`/playbook/{id}`)

- [ ] Header with strategy name and code
- [ ] Back button works
- [ ] Edit button works
- [ ] Delete button works

#### Performance Stats Card
- [ ] Trade count displays
- [ ] Total P&L (colored)
- [ ] Win rate percentage
- [ ] Profit factor
- [ ] Average R (colored)
- [ ] Compliance percentage (colored)
- [ ] Win/loss breakdown

#### Risk Settings Card (if configured)
- [ ] Target R-Multiple displays
- [ ] Max Risk per Trade displays

#### Rules & Criteria Card
- [ ] Entry Criteria displays
- [ ] Exit Criteria displays
- [ ] Risk Management rules display

#### Additional Info
- [ ] Description displays
- [ ] Notes display
- [ ] Reference chart/image displays (if URL provided)

### 6.4 Edit Strategy Page (`/playbook/{id}/edit`)

- [ ] Form pre-filled with existing data
- [ ] All fields editable
- [ ] Save updates strategy
- [ ] Cancel returns to detail
- [ ] Success message on save

### 6.5 Delete Strategy

- [ ] Delete button visible
- [ ] Confirmation dialog appears
- [ ] Warning about trades using strategy (if any)
- [ ] Cancel button works
- [ ] Confirm deletes strategy
- [ ] Redirects to playbook

---

## 7. Reports Page (`/reports`)

### 7.1 Weekly Report Card

- [ ] Week selector/navigator works
- [ ] Previous/next week buttons
- [ ] Week date range displayed
- [ ] Key metrics display:
  - [ ] Total trades
  - [ ] Winning trades
  - [ ] Losing trades
  - [ ] Win rate %
  - [ ] Total P&L
  - [ ] Profit factor
- [ ] Best day of week highlighted
- [ ] Worst day of week highlighted
- [ ] Daily breakdown within week
- [ ] Strategy performance for week
- [ ] Tag performance for week

### 7.2 Monthly Report Card

- [ ] Month selector works
- [ ] Previous/next month buttons
- [ ] Month/year displayed
- [ ] Key metrics display:
  - [ ] Total trades
  - [ ] Winning trades
  - [ ] Losing trades
  - [ ] Win rate %
  - [ ] Total P&L
  - [ ] Profit factor
  - [ ] Average R
- [ ] Best day of month highlighted
- [ ] Worst day of month highlighted
- [ ] Week-by-week breakdown
- [ ] Strategy performance for month
- [ ] Tag performance for month

### 7.3 Mistake Cost Analysis

- [ ] Shows trades with "mistake" tags
- [ ] Total cost from mistakes
- [ ] Percentage of trades that were mistakes
- [ ] Most expensive mistake tags
- [ ] Most common mistake tags
- [ ] Recommendations section

---

## 8. Monthly Page (`/monthly`)

### 8.1 Month Selection

- [ ] Month selector works
- [ ] Year selector works
- [ ] Previous/next month navigation
- [ ] Current month highlighted

### 8.2 Monthly Summary

- [ ] Gross P&L display
- [ ] Net P&L display (after fees)
- [ ] Total fees display
- [ ] Trade count
- [ ] Win rate
- [ ] Profit factor
- [ ] Average R

### 8.3 Tax Calculations (Personal Account)

- [ ] Day trade tax estimate
- [ ] Swing trade tax estimate
- [ ] Total estimated tax
- [ ] Post-tax P&L calculated
- [ ] Tax rates from settings used

### 8.4 Prop Account Calculations (Prop Account)

- [ ] Profit share percentage displayed
- [ ] Your share calculated
- [ ] Firm share calculated
- [ ] Net to you after share

### 8.5 Daily Breakdown

- [ ] Daily P&L table or chart
- [ ] Each trading day listed
- [ ] P&L per day
- [ ] Running total column
- [ ] Color coding for profit/loss days

### 8.6 Month Comparison

- [ ] Compare current month vs previous months
- [ ] Historical months chart
- [ ] Columns: Month, Trades, P&L, Win Rate
- [ ] Sortable columns
- [ ] Trend visualization

---

## 9. Settings Page (`/settings`)

### 9.1 Tab Navigation

- [ ] Profile tab visible
- [ ] Account tab visible
- [ ] Assets tab visible (admin only)
- [ ] Timeframes tab visible (admin only)
- [ ] Tab switching works
- [ ] Active tab highlighted

### 9.2 Profile Tab

#### User Information
- [ ] Name field displays current value
- [ ] Name field editable
- [ ] Email displays (read-only)

#### Language Settings
- [ ] Language selector works
- [ ] Portuguese (pt-BR) option
- [ ] English (en) option
- [ ] Selection persists
- [ ] UI updates on change

#### Theme Preferences
- [ ] Dark/Light mode toggle
- [ ] Changes apply immediately
- [ ] Selection persists

#### Date Format
- [ ] Format options available
- [ ] Selection updates date displays
- [ ] Selection persists

#### Password Change
- [ ] Current password field
- [ ] New password field
- [ ] Confirm new password field
- [ ] Password requirements shown
- [ ] Validation works
- [ ] Success message on change
- [ ] Error message for wrong current password

#### Save Profile
- [ ] Save button works
- [ ] Success toast appears
- [ ] Changes persist

### 9.3 Account Tab

#### Account Information
- [ ] Account name editable
- [ ] Account type selector (Personal/Prop)
- [ ] Prop firm name input (shows for Prop type)
- [ ] Profit share % input (shows for Prop type)

#### Commission & Fee Settings
- [ ] Default commission input
- [ ] Default fees input
- [ ] Values used as defaults for new trades

#### Asset-Level Fee Overrides
- [ ] List of configured assets shows
- [ ] Commission override per asset
- [ ] Fees override per asset
- [ ] Add asset fee override
- [ ] Edit asset fee override
- [ ] Remove asset fee override
- [ ] Enable/disable assets toggle

#### Tax Settings (Personal Account)
- [ ] Day trade tax rate % input
- [ ] Swing trade tax rate % input

#### Display Preferences
- [ ] Show tax estimates checkbox
- [ ] Show prop calculations checkbox

#### Risk Settings
- [ ] Default risk per trade % input
- [ ] Max daily loss limit input
- [ ] Max daily trades limit input

#### Recalculate Trades
- [ ] Recalculate button visible
- [ ] Confirmation dialog appears
- [ ] Loading state during recalculation
- [ ] Success message after completion
- [ ] All trade metrics updated

#### Save Account Settings
- [ ] Save button works
- [ ] Validation runs
- [ ] Success toast appears
- [ ] Changes persist

### 9.4 Assets Tab (Admin Only)

#### Asset List
- [ ] All assets displayed
- [ ] Columns: Symbol, Name, Type, Tick Size, Tick Value, Status
- [ ] Active/Inactive status indicator
- [ ] Sortable columns

#### Create Asset
- [ ] Create Asset button visible
- [ ] Form/modal opens
- [ ] Symbol input (required)
- [ ] Name input (required)
- [ ] Type selector (Stock, Future, Forex, Crypto, etc.)
- [ ] Tick size input
- [ ] Tick value input
- [ ] Save creates asset
- [ ] Validation works
- [ ] Success message
- [ ] Asset appears in list

#### Edit Asset
- [ ] Edit button/action on asset row
- [ ] Form pre-fills with data
- [ ] Fields editable
- [ ] Save updates asset
- [ ] Success message

#### Deactivate/Activate Asset
- [ ] Toggle or button to change status
- [ ] Confirmation for deactivation
- [ ] Status updates in list
- [ ] Deactivated assets hidden from trade forms

### 9.5 Timeframes Tab (Admin Only)

#### Timeframe List
- [ ] All timeframes displayed
- [ ] Columns: Code, Name, Type, Value, Status
- [ ] Active/Inactive status indicator

#### Create Timeframe
- [ ] Create Timeframe button visible
- [ ] Form/modal opens
- [ ] Code input (required)
- [ ] Name input (required)
- [ ] Type selector (Time-based, Renko)
- [ ] Value input (for time-based: minutes)
- [ ] Unit selector (for time-based)
- [ ] Points/Ticks input (for Renko)
- [ ] Save creates timeframe
- [ ] Validation works
- [ ] Success message
- [ ] Timeframe appears in list

#### Edit Timeframe
- [ ] Edit button/action on timeframe row
- [ ] Form pre-fills with data
- [ ] Fields editable
- [ ] Save updates timeframe
- [ ] Success message

#### Deactivate/Activate Timeframe
- [ ] Toggle or button to change status
- [ ] Status updates in list
- [ ] Deactivated timeframes hidden from trade forms

---

## 10. Modals & Dialogs

### 10.1 Day Detail Modal

- [ ] Opens from dashboard interactions
- [ ] Date header displays
- [ ] Loading state while fetching
- [ ] Summary stats populate
- [ ] Equity curve displays
- [ ] Trade list displays
- [ ] Click trade navigates
- [ ] Close button works
- [ ] Escape key closes
- [ ] Click outside closes

### 10.2 Execution Form Modal

- [ ] Opens from Add Execution button
- [ ] All fields display
- [ ] Edit mode pre-fills data
- [ ] Save button works
- [ ] Cancel closes without saving
- [ ] Success feedback
- [ ] Form clears for next entry

### 10.3 Delete Confirmation Dialogs

- [ ] Trade deletion dialog
- [ ] Strategy deletion dialog
- [ ] Execution deletion dialog
- [ ] Asset deletion dialog (admin)
- [ ] Timeframe deletion dialog (admin)
- [ ] Cancel button cancels
- [ ] Confirm button executes action
- [ ] Proper warning messages

### 10.4 Alert Dialogs

- [ ] Error alerts display with message
- [ ] Success alerts display with message
- [ ] Warning alerts display with message
- [ ] Auto-dismiss after timeout (if applicable)
- [ ] Dismiss button works

---

## 11. Error Handling & Edge Cases

### 11.1 Form Validation

- [ ] Required fields show errors when empty
- [ ] Decimal inputs validate format
- [ ] Email validation works
- [ ] Password validation works
- [ ] Date validation (future dates prevented where appropriate)
- [ ] Duplicate prevention (email, strategy code)
- [ ] Error messages clear after correction
- [ ] Form cannot submit with validation errors

### 11.2 Loading States

- [ ] Forms show loading spinner during submission
- [ ] Buttons disable during submission
- [ ] Pages show loading skeleton while fetching
- [ ] Modals show loading while fetching
- [ ] Charts show loading state

### 11.3 Empty States

- [ ] No trades in journal shows empty message + CTA
- [ ] No strategies shows empty message + CTA
- [ ] No data in analytics shows appropriate message
- [ ] No executions shows empty list message
- [ ] Empty charts show "No data" state

### 11.4 Authentication Errors

- [ ] Expired session redirects to login
- [ ] Invalid session redirects to login
- [ ] Unauthorized access returns appropriate error

### 11.5 Network Errors

- [ ] Network error shows user-friendly message
- [ ] Retry option available where appropriate
- [ ] Form data preserved on error

### 11.6 Server Errors

- [ ] 500 errors show user-friendly message
- [ ] 404 errors show not found page
- [ ] Validation errors return detailed messages

---

## 12. Data Calculations & Accuracy

### 12.1 Trade P&L Calculations

- [ ] Long trade: (exit - entry) × size
- [ ] Short trade: (entry - exit) × size
- [ ] Fees subtracted from gross P&L
- [ ] Commission subtracted from gross P&L
- [ ] Net P&L = Gross P&L - Commission - Fees
- [ ] Outcome correct: win (P&L > 0), loss (P&L < 0), breakeven (P&L = 0)

### 12.2 Risk Calculations

- [ ] Planned risk = |entry - stop loss| × size
- [ ] Planned R = |take profit - entry| / |entry - stop loss|
- [ ] Realized R = P&L / planned risk
- [ ] MFE captured correctly
- [ ] MAE captured correctly

### 12.3 Statistics Calculations

- [ ] Win rate = wins / (wins + losses) × 100
- [ ] Profit factor = gross wins / gross losses
- [ ] Average win = sum of wins / win count
- [ ] Average loss = sum of losses / loss count
- [ ] Average R = sum of R multiples / trade count
- [ ] Equity curve aggregates correctly
- [ ] Daily P&L sums correctly
- [ ] Streak calculations accurate

### 12.4 Scaled Position Calculations

- [ ] Total entry quantity = sum of entry quantities
- [ ] Total exit quantity = sum of exit quantities
- [ ] Average entry price = weighted average of entries
- [ ] Average exit price = weighted average of exits
- [ ] Remaining quantity = entry qty - exit qty
- [ ] Position status updates correctly

### 12.5 Monthly/Tax Calculations

- [ ] Monthly P&L sums correctly
- [ ] Day trade tax calculated correctly
- [ ] Swing trade tax calculated correctly
- [ ] Prop profit share calculated correctly
- [ ] Year-to-date totals accurate

---

## 13. Performance & Responsiveness

### 13.1 Page Load Performance

- [ ] Dashboard loads within 3 seconds
- [ ] Journal loads within 2 seconds
- [ ] Analytics loads within 3 seconds
- [ ] Settings loads within 2 seconds
- [ ] No blocking during initial render

### 13.2 Chart Performance

- [ ] Charts render within 1 second
- [ ] Hover interactions responsive
- [ ] No jank during chart animations
- [ ] Large datasets handled smoothly

### 13.3 Responsive Design

#### Desktop (1024px+)
- [ ] Full sidebar visible
- [ ] Multi-column layouts display
- [ ] Charts full size

#### Tablet (768px - 1023px)
- [ ] Sidebar collapsible
- [ ] Layouts adjust appropriately
- [ ] Charts resize

#### Mobile (< 768px)
- [ ] Sidebar hidden by default
- [ ] Single column layouts
- [ ] Tables horizontally scrollable
- [ ] Charts stack vertically
- [ ] Touch targets large enough
- [ ] Forms usable on mobile

---

## 14. Multi-Account Support

### 14.1 Account Isolation

- [ ] Trades only visible for selected account
- [ ] Strategies only visible for selected account
- [ ] Analytics reflect selected account only
- [ ] Reports reflect selected account only
- [ ] Settings per account where applicable

### 14.2 Account Switching

- [ ] Switcher shows all user accounts
- [ ] Switching updates all data
- [ ] Session updates with new account
- [ ] No data leakage between accounts

### 14.3 Account Types

- [ ] Personal account shows tax settings
- [ ] Prop account shows profit share settings
- [ ] Calculations differ based on type
- [ ] Display preferences respected

---

## 15. Internationalization (i18n)

### 15.1 Language Support

- [ ] Portuguese (pt-BR) fully translated
- [ ] English (en) fully translated
- [ ] No missing translation keys visible
- [ ] All pages respond to language change
- [ ] Language persists across sessions

### 15.2 Date Formatting

- [ ] Dates display in user's preferred format
- [ ] Date pickers use correct format
- [ ] Calendar respects locale

### 15.3 Number Formatting

- [ ] Currency displays correct symbol (R$)
- [ ] Decimal separator correct for locale
- [ ] Thousands separator correct for locale

---

## 16. Accessibility

### 16.1 Keyboard Navigation

- [ ] Tab key navigates all interactive elements
- [ ] Tab order logical
- [ ] Enter key activates buttons
- [ ] Space key activates checkboxes/toggles
- [ ] Escape closes modals
- [ ] Arrow keys navigate dropdowns
- [ ] Focus visible on all elements

### 16.2 Screen Reader Support

- [ ] All images have alt text
- [ ] Form labels properly associated
- [ ] Buttons have descriptive text
- [ ] Modals announced when opened
- [ ] Error messages announced
- [ ] ARIA labels present where needed

### 16.3 Visual Accessibility

- [ ] Color not sole indicator of information
- [ ] Sufficient contrast ratios
- [ ] Focus states clearly visible
- [ ] Text size readable (min 12px)
- [ ] Interactive elements clearly distinguishable

---

## 17. Security

### 17.1 Authentication Security

- [ ] Passwords hashed (never stored plain)
- [ ] Session tokens secure
- [ ] HTTPS enforced
- [ ] Logout clears all session data

### 17.2 Authorization

- [ ] Users can only access own data
- [ ] Admin features require admin role
- [ ] API validates account ownership
- [ ] No IDOR vulnerabilities

### 17.3 Input Security

- [ ] Form inputs validated client-side
- [ ] Form inputs validated server-side
- [ ] SQL injection prevented (ORM)
- [ ] XSS prevented (output encoding)
- [ ] CSRF tokens used

---

## Test Environment Setup

- [ ] Test user account created
- [ ] Test trading account (Personal) created
- [ ] Test trading account (Prop) created
- [ ] Sample assets configured
- [ ] Sample timeframes configured
- [ ] Sample strategies created
- [ ] Sample tags created
- [ ] Sample trades with various scenarios created

---

## Notes

- Mark each item with [x] when tested and passed
- Add comments for any issues found
- Record browser/device used for testing
- Note any edge cases discovered during testing
