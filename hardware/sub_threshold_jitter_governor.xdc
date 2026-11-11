###############################################################################
# Sub-Threshold Jitter Governor - Xilinx Vivado Design Constraints (XDC)
# Target Frequency: 100.000 MHz (10.000 ns clock period)
# Target Device   : Artix-7 / Kintex UltraScale+ Neurocore Bridge
###############################################################################

# 1. Primary System Clock (100 MHz on Pin E3)
create_clock -name clk -period 10.000 -waveform {0.000 5.000} [get_ports clk]
set_clock_uncertainty -setup 0.120 [get_clocks clk]
set_clock_uncertainty -hold  0.060 [get_clocks clk]

# 2. Synchronous Input / Output Delays (using valid [*] bus wildcards)
set_input_delay  -clock [get_clocks clk] -max 2.500 [get_ports {measured_jitter_us[*] enable}]
set_input_delay  -clock [get_clocks clk] -min 0.500 [get_ports {measured_jitter_us[*] enable}]

set_output_delay -clock [get_clocks clk] -max 1.800 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]
set_output_delay -clock [get_clocks clk] -min 0.300 [get_ports {leak_coefficient[*] delay_line_offset_us[*] jitter_locked}]

# 3. Asynchronous Reset Path & 2-FF Synchronizer Placement
set_false_path -from [get_ports rst_n]
set_property ASYNC_REG TRUE [get_cells -quiet {rst_sync_reg[*]}]

# 4. Multicycle Paths for 2-Cycle Adaptive PI Integrator Loop
#    In Vivado XDC, -setup 2 shifts the default hold edge to cycle 1;
#    -hold 1 returns the hold check to cycle 0 (0.000 ns launch/capture edge).
set_multicycle_path 2 -setup \
    -from [get_cells {leak_coefficient_reg[*]}] \
    -to   [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]

set_multicycle_path 1 -hold \
    -from [get_cells {leak_coefficient_reg[*]}] \
    -to   [get_cells {lock_counter_reg[*] leak_coefficient_reg[*] delay_line_offset_us_reg[*]}]

# 5. Physical & Environmental Constraints (Vivado DRC NSTD-1 Clean)
set_property PACKAGE_PIN E3      [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports {enable rst_n jitter_locked}]
set_property IOSTANDARD LVCMOS33 [get_ports {measured_jitter_us[*] leak_coefficient[*] delay_line_offset_us[*]}]

set_property BITSTREAM.CONFIG.CONFIGRATE 50 [current_design]
set_property CONFIG_VOLTAGE 3.3             [current_design]
set_property CFGBVS VCCO                    [current_design]
