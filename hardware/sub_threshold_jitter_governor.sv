// =============================================================================
// Module: sub_threshold_jitter_governor
// Target: Intel Loihi 2 Neurocore Bridge / Custom FPGA RTL (100 MHz, 10.0 ns)
// Purpose: Adaptive PI leak & delay-line jitter governor maintaining 0.46 ms
//          (460 us) AER temporal jitter envelope using a 2-cycle multicycle
//          control update loop.
// =============================================================================
`timescale 1ns / 1ps

module sub_threshold_jitter_governor #(
    parameter int JITTER_TARGET_US = 16'd460,  // 0.46 ms nominal AER jitter
    parameter int LOCK_TOLERANCE_US = 16'd25,  // +/- 25 us lock window
    parameter int LOCK_THRESHOLD    = 8'd16    // Consecutive locked steps required
) (
    input  logic        clk,
    input  logic        rst_n,
    input  logic        enable,
    input  logic [15:0] measured_jitter_us,
    output logic [15:0] leak_coefficient,
    output logic [15:0] delay_line_offset_us,
    output logic        jitter_locked
);

    // -------------------------------------------------------------------------
    // 1. 2-FF Asynchronous Reset Synchronizer (Matches ASYNC_REG in XDC)
    // -------------------------------------------------------------------------
    (* ASYNC_REG = "TRUE" *) logic [1:0] rst_sync_reg;
    logic srst_n;

    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            rst_sync_reg <= 2'b00;
        end else begin
            rst_sync_reg <= {rst_sync_reg[0], 1'b1};
        end
    end
    assign srst_n = rst_sync_reg[1];

    // -------------------------------------------------------------------------
    // 2. 2-Cycle Multicycle Phase Divider (pi_step_en toggles every 2 cycles)
    // -------------------------------------------------------------------------
    logic pi_step_en;
    always_ff @(posedge clk) begin
        if (!srst_n) begin
            pi_step_en <= 1'b0;
        end else if (enable) begin
            pi_step_en <= ~pi_step_en;
        end else begin
            pi_step_en <= 1'b0;
        end
    end

    // -------------------------------------------------------------------------
    // 3. Adaptive PI Integrator & Lock Counter Registers
    //    Constrained via set_multicycle_path 2 -setup / 1 -hold
    // -------------------------------------------------------------------------
    logic [15:0] leak_coefficient_reg;
    logic [15:0] delay_line_offset_us_reg;
    logic [7:0]  lock_counter_reg;

    logic signed [16:0] jitter_error_s17;
    logic [15:0]        abs_error_u16;

    assign jitter_error_s17 = $signed({1'b0, measured_jitter_us}) - $signed(17'(JITTER_TARGET_US));
    assign abs_error_u16    = (jitter_error_s17 < 0) ? 16'(-jitter_error_s17) : 16'(jitter_error_s17);

    always_ff @(posedge clk) begin
        if (!srst_n) begin
            leak_coefficient_reg     <= 16'h4000; // Q2.14 unity nominal leak
            delay_line_offset_us_reg <= 16'd0;
            lock_counter_reg         <= 8'd0;
        end else if (enable && pi_step_en) begin
            // Adaptive PI leak update clamped to [0x1000, 0x7800]
            if (jitter_error_s17 > 17'sd16) begin
                leak_coefficient_reg <= (leak_coefficient_reg < 16'h7700)
                    ? (leak_coefficient_reg + 16'h0080)
                    : 16'h7800;
                delay_line_offset_us_reg <= (abs_error_u16 >> 1);
            end else if (jitter_error_s17 < -17'sd16) begin
                leak_coefficient_reg <= (leak_coefficient_reg > 16'h1100)
                    ? (leak_coefficient_reg - 16'h0080)
                    : 16'h1000;
                delay_line_offset_us_reg <= 16'd0;
            end

            // Lock counter depends on leak_coefficient_reg saturation & error band
            if ((abs_error_u16 <= LOCK_TOLERANCE_US) &&
                (leak_coefficient_reg >= 16'h1200) &&
                (leak_coefficient_reg <= 16'h7600)) begin
                if (lock_counter_reg < 8'hFF)
                    lock_counter_reg <= lock_counter_reg + 8'd1;
            end else begin
                lock_counter_reg <= 8'd0;
            end
        end
    end

    assign leak_coefficient     = leak_coefficient_reg;
    assign delay_line_offset_us = delay_line_offset_us_reg;
    assign jitter_locked        = (lock_counter_reg >= LOCK_THRESHOLD);

endmodule
