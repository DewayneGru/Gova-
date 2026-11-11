###############################################################################
# Sub-Threshold Jitter Governor - Synopsys Design Constraints (SDC)
# Target Frequency: 100.000 MHz (10.000 ns clock period)
# Substrate Target: Intel Loihi 2 Neurocore Bridge / Custom FPGA RTL
# Reference Asset : /assets/aistudio/Synopsys_Design_Constraints_a7110491.pdf
###############################################################################

# -----------------------------------------------------------------------------
# 1. Primary Clock Definition (100 MHz system clock on pin clk)
# -----------------------------------------------------------------------------
create_clock -name clk -period 10.000 -waveform {0.000 5.000} [get_ports clk]

# Clock uncertainty modeling PLL + cycle-domain projection of 0.46 ms AER jitter
set_clock_uncertainty -setup 0.120 [get_clocks clk]
set_clock_uncertainty -hold  0.060 [get_clocks clk]
set_clock_transition  0.080 [get_clocks clk]

# -----------------------------------------------------------------------------
# 2. Input and Output Delay Constraints relative to clk
#    FIX: Replaced stripped '[]' brackets with valid Tcl bus glob '[*]'
#    FIX: Separated concatenated set_output_delay commands onto distinct lines
#    FIX: Removed asynchronous 'rst_n' from synchronous input_delay list
# -----------------------------------------------------------------------------
set_input_delay -clock clk -max 2.500 [get_ports {measured_jitter_us[*] enable}]
set_input_delay -clock clk -min 0.500 [get_ports {measured_jitter_us[*] enable}]

set_output_delay -clock clk -max 1.800 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]
set_output_delay -clock clk -min 0.300 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]

# -----------------------------------------------------------------------------
# 3. False Paths & Asynchronous Control Crossings
#    NOTE: External rst_n pad is asynchronous; internal deassertion must pass
#    through a 2-FF reset bridge (rst_sync_reg[0:1]) checked for recovery/removal.
# -----------------------------------------------------------------------------
set_false_path -from [get_ports rst_n]

# -----------------------------------------------------------------------------
# 4. Multicycle Paths for Adaptive PI Integrator Feedback Loop
#    FIX: Restored '[*]' bus wildcards on register cell globs
#    FIX: Split concatenated setup/hold commands onto separate lines
#    FIX: Covered both PI accumulator self-loop and lock_counter datapath
#    Setup = 2 cycles (20.000 ns window); Hold = 1 cycle shift back (0.000 ns edge)
# -----------------------------------------------------------------------------
set_multicycle_path 2 -setup \
    -from [get_cells {leak_coefficient_reg[*]}] \
    -to   [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]

set_multicycle_path 1 -hold \
    -from [get_cells {leak_coefficient_reg[*]}] \
    -to   [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]
