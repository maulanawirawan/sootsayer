//! WebAssembly exports: a tiny C ABI over linear memory, no wasm-bindgen.
//!
//! Protocol (see `web/src/engine.ts`):
//! 1. JS calls `ss_alloc(len)` and copies UTF-8 JSON into that buffer.
//! 2. JS calls `ss_outlook(ptr, len)` (or another entry point). The result is a
//!    pointer to `[u32 little-endian byte length][UTF-8 JSON envelope]`.
//! 3. JS reads the result, then frees both buffers with `ss_free(ptr, len)`;
//!    the result buffer's size is `4 + byte length`.

use std::alloc::{Layout, alloc, dealloc};

#[unsafe(no_mangle)]
pub extern "C" fn ss_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::NonNull::<u8>::dangling().as_ptr();
    }
    match Layout::from_size_align(len, 1) {
        // SAFETY: the layout has a non-zero size.
        Ok(layout) => unsafe { alloc(layout) },
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// `ptr` must come from `ss_alloc(len)` (or be a result buffer of size `len`)
/// and must not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_free(ptr: *mut u8, len: usize) {
    if len == 0 || ptr.is_null() {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(len, 1) {
        // SAFETY: guaranteed by the caller contract above.
        unsafe { dealloc(ptr, layout) }
    }
}

fn respond(json: String) -> *mut u8 {
    let bytes = json.into_bytes();
    let len = bytes.len() as u32;
    let out = ss_alloc(4 + bytes.len());
    if out.is_null() {
        return out;
    }
    // SAFETY: `out` points to 4 + bytes.len() writable bytes.
    unsafe {
        std::ptr::copy_nonoverlapping(len.to_le_bytes().as_ptr(), out, 4);
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), out.add(4), bytes.len());
    }
    out
}

/// # Safety
/// `ptr` must point to `len` readable bytes (or `len` must be 0).
unsafe fn view<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 || ptr.is_null() {
        &[]
    } else {
        // SAFETY: guaranteed by the caller contract above.
        unsafe { std::slice::from_raw_parts(ptr, len) }
    }
}

/// # Safety
/// `ptr` must point to `len` readable bytes of UTF-8 JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_outlook(ptr: *const u8, len: usize) -> *mut u8 {
    respond(crate::json::outlook(unsafe { view(ptr, len) }))
}

/// # Safety
/// `ptr` must point to `len` readable bytes of UTF-8 JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_clean_air(ptr: *const u8, len: usize) -> *mut u8 {
    respond(crate::json::clean_air(unsafe { view(ptr, len) }))
}

/// # Safety
/// `ptr` must point to `len` readable bytes of UTF-8 JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_fire_counts(ptr: *const u8, len: usize) -> *mut u8 {
    respond(crate::json::fire_counts(unsafe { view(ptr, len) }))
}

/// # Safety
/// `ptr` must point to `len` readable bytes of UTF-8 JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_locate(ptr: *const u8, len: usize) -> *mut u8 {
    respond(crate::json::locate(unsafe { view(ptr, len) }))
}

/// # Safety
/// `ptr` must point to `len` readable bytes of UTF-8 JSON.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn ss_brief(ptr: *const u8, len: usize) -> *mut u8 {
    respond(crate::json::brief(unsafe { view(ptr, len) }))
}
