# Visual Appointment System - Complete Summary

## Overview

The Visual Appointment System is a comprehensive simulation and visualization tool for managing clinic appointments. It provides a real-time view of how patients move through the queue, how doctors consult with patients, and what messages patients receive on their mobile app.

---

## System Architecture

### 1. Configuration Phase

#### **Initial Setup**
- **Total Consultation Time**: Total duration available for consultations (e.g., 120 minutes)
- **Average Consultation Time per Slot**: Time allocated per patient (e.g., 5 minutes)
- **Start Time**: When consultations begin (e.g., 09:00)
- **Total Slots**: Automatically calculated as `Total Consultation Time / Average Consultation Time`

#### **Token Distribution**
- **Maximum A Token Count (Advanced Booking)**: Maximum number of A tokens that can be assigned (e.g., 20 tokens = 85% of total slots)
- **Minimum W Token Count (Walk-in)**: Minimum assigned slots for walk-in patients (e.g., 4 tokens = 15% of total slots)
- **Auto-calculation**: When one token type is set to its target percentage (85% or 15%), the system automatically calculates the complementary value

#### **Queue Initialization**
- Clicking "Initialize Queue" creates empty slots for all available time slots
- Queue starts empty - tokens must be added manually via A/W buttons
- Each slot represents a time slot (e.g., 09:00, 09:05, 09:10, etc.)

---

## 2. Token Assignment Logic

### **A Tokens (Advanced Booking)**
- **Booking Restriction**: A tokens can only be assigned to slots that are **at least 1 hour** from the current simulation time
- **Assignment Logic**:
  - If simulation is running: Finds first empty slot ≥ (current time + 1 hour)
  - If simulation not started: Assigns from the first (earliest) available slot
- **Maximum Limit**: Cannot exceed `maxATokenCount`
- **Token Numbering**: Sequential (A001, A002, A003, ...)
- **Arrival Requirement**: Must arrive **5 minutes before** their appointment time

### **W Tokens (Walk-in)**
- **Placement Logic**: W tokens are placed at **every 7th position** (positions 7, 14, 21, etc.)
- **Numbering**: Starts from `maxATokenCount + 1` (e.g., if max A = 20, first W is W021, second is W022)
- **Token Shifting**: If target 7th position is occupied, subsequent tokens are shifted forward to make space
- **Minimum Count**: Can use empty A slots if minimum W count is not met
- **Immediate Arrival**: W tokens are immediately marked as "arrived" when added (they're physically at the clinic)

### **Slot Type Toggling**
- Clicking any slot in Queue Visualization toggles its type (A ↔ W ↔ Empty)
- Toggling respects maximum/minimum constraints
- Automatically creates/removes patient entries

---

## 3. Simulation Mechanics

### **Simulation Time**
- **Start Time**: 7 minutes before the first consultation slot (e.g., 08:53 for 09:00 start)
- **Purpose**: Allows testing of 5-minute arrival window (patients must arrive by 08:55 for 09:00 slot)
- **Speed Control**: Adjustable (0.5x, 1x, 2x, 5x speed)
- **Manual Control**: "+7 Min" button for quick testing

### **Patient Status Processing**

#### **Pending → Arrived**
- A token patients are automatically marked as "arrived" when simulation time reaches **5 minutes before** their appointment time
- If they haven't arrived by this time, they move to "Skipped" status
- W tokens are already marked as "arrived" when added

#### **Pending → Skipped**
- If simulation time is **after** the required arrival time (5 minutes before appointment), patient is marked as "Skipped"
- Skipped patients appear in the "Skipped Queue"
- They can manually rejoin the queue (placed at position 3 if ≥3 people ahead, otherwise at end)

#### **Arrived → Consulting**
- Doctor picks the **first patient** from the Arrived Queue (position 1), regardless of appointment time
- Consultation starts immediately when picked
- Consultation end time = current time + average consultation time

#### **Consulting → Completed**
- Patient is marked as "Completed" when:
  - Consultation end time is reached (automatic), OR
  - "Complete Consultation" button is clicked (manual)
- Delay is calculated if actual consultation time > average consultation time

---

## 4. Queue Management

### **Arrived Queue Structure**
- **Sorting Logic**:
  - A tokens first (in order of slot index)
  - W tokens placed at every 7th position (after 6 A tokens)
  - If <6 A tokens arrived, W tokens go to end
  - Rejoined skipped patients placed at position 3 (after 2 people) if ≥3 people ahead, otherwise at end

### **Queue Visualization**
- Shows all slots in chronological order
- Displays:
  - Active patients (pending, arrived, consulting, completed)
  - Skipped patients (in their original slot positions)
  - Empty slots
- Each slot shows: slot number, time, token type, token number, status indicators

### **Skipped Queue**
- Separate queue for patients who arrived late
- Shows required arrival time vs. actual arrival time
- "Mark Arrived" button to rejoin main queue

---

## 5. Doctor Status & Availability

### **Doctor Availability Toggle**
- **Toggle Switch**: Controls whether doctor is "Available" or "Out"
- **When Available (ON)**: Doctor automatically picks patients from Arrived Queue
- **When Out (OFF)**: Doctor does not pick patients, even if available in queue
- **Status Display**: Shows current patient being consulted or "Available/Waiting"

### **Delay Tracking**
- **Delay Calculation**: `Delay = Actual Consultation Time - Average Consultation Time`
- **Total Delay**: Sum of all delays across all consultations
- **Display**: 
  - Total delay shown in Doctor Status section
  - Red if >0, green if 0
  - Shows count of delayed consultations
- **Impact on Wait Time**: Total delay is added to estimated wait times for patients in queue

---

## 6. Patient App Experience (Real-time Messages)

### **Message Display**
Each patient in the Arrived Queue sees real-time status messages on their app:

#### **Status Messages (Context-Aware)**

1. **"Currently consulting with doctor"** (Purple)
   - Shown when patient is being consulted
   - Message: "Please wait while the doctor examines you"

2. **"Doctor is currently unavailable"** (Orange)
   - Shown when doctor toggle is OFF
   - Message: "Please wait for doctor to return"

3. **"🎉 You are next!"** (Green)
   - Shown when patient is position 1 and doctor is available
   - Message: "Doctor will call you shortly"

4. **"Position X in queue"** (Blue)
   - Shown for all other patients
   - Message: "X patients ahead of you"

#### **Additional Information**

- **Estimated Wait Time**: 
  - Calculated as: `Position × Average Consultation Time + Total Delay`
  - Updates in real-time as delays accumulate
  - Shows delay warning if doctor is running behind

- **Appointment Time**: Displays scheduled appointment time

- **Token Number**: Prominently displayed at top of card

---

## 7. Real-time Updates & Synchronization

### **Automatic Updates**
- **Simulation Time**: Updates continuously based on selected speed
- **Patient Status**: Automatically transitions based on time-based rules
- **Queue Positions**: Recalculate when patients are added/removed/rejoined
- **Delay Tracking**: Accumulates as consultations complete

### **Manual Updates**
- **Add Tokens**: A/W buttons add tokens to queue
- **Mark Arrived**: Manual arrival confirmation for A tokens
- **Rejoin Queue**: Skipped patients can rejoin
- **Complete Consultation**: Manual completion (also triggers delay calculation)
- **Toggle Doctor Status**: Control doctor availability

---

## 8. Key Features & Use Cases

### **Testing Scenarios**

1. **Normal Flow**
   - Add A tokens → Patients arrive on time → Doctor consults → Complete

2. **Late Arrivals**
   - A tokens don't arrive by 5-min deadline → Marked as Skipped → Can rejoin

3. **Walk-in Placement**
   - Add W tokens → Automatically placed at 7th positions → Shift other tokens

4. **Delay Simulation**
   - Consultations take longer than average → Delay accumulates → Affects wait times

5. **Doctor Unavailable**
   - Toggle doctor to "Out" → Patients wait → Toggle back → Doctor resumes

6. **Queue Reordering**
   - Skipped patients rejoin → Placed at position 3 → Queue adjusts

### **Visualization Benefits**

- **Real-time Queue Status**: See exactly who's where in the queue
- **Patient Experience**: Understand what patients see on their app
- **Delay Impact**: Visualize how delays affect the entire queue
- **Token Distribution**: See A/W token placement and ratios
- **Status Tracking**: Monitor patient status transitions

---

## 9. Technical Implementation

### **State Management**
- **Slots**: Array of all time slots with type, token, and index
- **Patients**: Array of patient objects with status, arrival time, etc.
- **Queues**: Derived from patients array (arrivedQueue, skippedQueue)
- **Simulation**: simulationTime, isRunning, simulationSpeed
- **Doctor**: currentPatient, doctorConsultationEndTime, doctorAvailable, delays

### **Calculations**
- **Total Slots**: `Math.floor(consultationTime / averageConsultationTime)`
- **Delay**: `Math.max(0, actualConsultationTime - averageConsultationTime)`
- **Wait Time**: `position × averageConsultationTime + totalDelay`
- **W Token Position**: `(existingWCount + 1) × 7`

### **Real-time Processing**
- **useEffect Hooks**: Process patient status, doctor consultation, queue updates
- **Automatic Transitions**: Time-based rules trigger status changes
- **Queue Sorting**: Dynamic sorting based on token type and position rules

---

## 10. Workflow Summary

### **Complete Flow Example**

1. **Setup**:
   - Configure: 120 min total, 5 min per slot, 09:00 start
   - Set: Max A = 20, Min W = 4
   - Initialize: Creates 24 empty slots

2. **Add Tokens**:
   - Add A001-A020 (20 A tokens)
   - Add W021-W024 (4 W tokens at positions 7, 14, 21, 28)
   - W tokens immediately marked as "arrived"

3. **Start Simulation**:
   - Time starts at 08:53 (7 min before 09:00)
   - A tokens must arrive by 5 min before their slot (e.g., A001 at 08:55 for 09:00 slot)

4. **Patient Arrival**:
   - At 08:55: A001 automatically arrives → Goes to Arrived Queue position 1
   - At 09:00: A002 arrives → Goes to Arrived Queue position 2
   - If A001 didn't arrive by 08:55 → Marked as Skipped

5. **Doctor Consultation**:
   - At 09:00: Doctor picks A001 (position 1) → Consultation starts
   - Consultation ends at 09:05 (if no delay)
   - A001 marked as "Completed"
   - Doctor picks A002 (now position 1)

6. **Delay Scenario**:
   - A001 consultation takes 7 minutes (2 min delay)
   - Total delay = +2 min
   - A002's wait time increases: `1 × 5 + 2 = 7 minutes`

7. **Patient App Updates**:
   - A001 sees: "Currently consulting with doctor"
   - A002 sees: "🎉 You are next!" (after A001 completes)
   - A003 sees: "Position 2 in queue, Est. wait: ~12 min" (includes delay)

8. **Queue Reordering**:
   - W token (position 7) moves up as patients complete
   - Skipped patient rejoins → Placed at position 3
   - Queue adjusts automatically

---

## 11. Key Insights & Benefits

### **System Benefits**
- **Visual Clarity**: See the entire appointment system at a glance
- **Real-time Feedback**: Instant updates as simulation progresses
- **Patient Experience**: Understand what patients see and feel
- **Delay Impact**: Visualize how delays cascade through the queue
- **Testing**: Test various scenarios without real patients

### **Business Insights**
- **Capacity Planning**: Understand slot utilization and token distribution
- **Wait Time Management**: See how delays affect patient wait times
- **Queue Optimization**: Test different token placement strategies
- **Resource Planning**: Understand doctor availability impact

---

## 12. Future Enhancements (Potential)

- **Multiple Doctors**: Simulate multiple doctors consulting simultaneously
- **Break Times**: Add doctor break times to simulation
- **Patient Preferences**: Allow patients to reschedule or cancel
- **Analytics Dashboard**: Historical data and performance metrics
- **Export Reports**: Generate reports of simulation results
- **Notification System**: Simulate push notifications to patient app
- **Advanced Routing**: Different queues for different departments

---

## Conclusion

The Visual Appointment System provides a comprehensive tool for understanding, testing, and optimizing clinic appointment management. It combines real-time simulation with visual feedback to help clinic administrators understand how their appointment system works in practice, how delays affect patient experience, and what patients see on their mobile app.

The system is particularly valuable for:
- **Training**: New staff can understand the appointment flow
- **Testing**: Try different scenarios before implementing changes
- **Optimization**: Identify bottlenecks and inefficiencies
- **Patient Communication**: Understand what patients experience and receive

By visualizing the entire system in real-time, clinic administrators can make data-driven decisions to improve patient experience and operational efficiency.



